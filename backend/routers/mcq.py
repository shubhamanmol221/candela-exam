from fastapi import APIRouter, HTTPException

from database import db, id_filter, now_iso, serialize_doc, serialize_many, with_ids
from schemas import MCQQuestionCreate, MCQSubmitRequest

router = APIRouter()


@router.post("/mcq/questions")
def create_mcq_question(body: MCQQuestionCreate):
    try:
        if len(body.options) != 4:
            raise HTTPException(status_code=400, detail="Exactly 4 options required")
        if body.correct_option not in range(4):
            raise HTTPException(status_code=400, detail="correct_option must be 0-3")
        assessment = serialize_doc(db.assessments.find_one({"id": body.assessment_id}))
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        payload = with_ids({
            **body.model_dump(),
            "created_at": now_iso(),
        })
        db.mcq_questions.insert_one(payload)
        return serialize_doc(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mcq/questions/bulk")
def bulk_create_mcq_questions(body: dict):
    try:
        assessment_id = body.get("assessment_id")
        questions = body.get("questions", [])
        if not assessment_id:
            raise HTTPException(status_code=400, detail="assessment_id is required")
        if not isinstance(questions, list) or not questions:
            raise HTTPException(status_code=400, detail="questions must be a non-empty array")
        assessment = serialize_doc(db.assessments.find_one({"id": assessment_id}))
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        inserted = 0
        for q in questions:
            options = q.get("options", [])
            correct_option = q.get("correct_option", 0)
            if len(options) != 4:
                raise HTTPException(status_code=400, detail="Each question must have exactly 4 options")
            if correct_option not in range(4):
                raise HTTPException(status_code=400, detail="correct_option must be 0-3")
            payload = with_ids({
                "assessment_id": assessment_id,
                "question_text": q.get("question_text", ""),
                "options": options,
                "correct_option": correct_option,
                "marks": q.get("marks", 1),
                "created_at": now_iso(),
            })
            db.mcq_questions.insert_one(payload)
            inserted += 1
        return {"message": f"Uploaded {inserted} question(s)", "count": inserted}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mcq/questions/{assessment_id}")
def list_mcq_questions(assessment_id: str):
    try:
        docs = db.mcq_questions.find({"assessment_id": assessment_id}).sort("created_at", 1)
        return serialize_many(docs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/mcq/questions/{question_id}")
def update_mcq_question(question_id: str, body: dict):
    try:
        allowed = {"question_text", "options", "correct_option", "marks"}
        update_data = {k: v for k, v in body.items() if k in allowed and v is not None}
        if "options" in update_data and len(update_data["options"]) != 4:
            raise HTTPException(status_code=400, detail="Exactly 4 options required")
        if "correct_option" in update_data and update_data["correct_option"] not in range(4):
            raise HTTPException(status_code=400, detail="correct_option must be 0-3")
        if not update_data:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        update_data["updated_at"] = now_iso()
        res = db.mcq_questions.update_one(id_filter(question_id), {"$set": update_data})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Question not found")
        return serialize_doc(db.mcq_questions.find_one(id_filter(question_id)))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/mcq/questions/{question_id}")
def delete_mcq_question(question_id: str):
    try:
        res = db.mcq_questions.delete_one(id_filter(question_id))
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Question not found")
        return {"message": "Question deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate/mcq/{assessment_id}")
def get_mcq_assessment(assessment_id: str):
    try:
        assessment = serialize_doc(db.assessments.find_one({"id": assessment_id}))
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        questions_raw = serialize_many(
            db.mcq_questions.find({"assessment_id": assessment_id}).sort("created_at", 1)
        )
        questions = [
            {k: v for k, v in q.items() if k != "correct_option"}
            for q in questions_raw
        ]
        return {**assessment, "questions": questions}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mcq/submit")
def submit_mcq(body: MCQSubmitRequest):
    try:
        assessment = serialize_doc(db.assessments.find_one({"id": body.assessment_id}))
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")

        questions = serialize_many(
            db.mcq_questions.find({"assessment_id": body.assessment_id}).sort("created_at", 1)
        )
        if not questions:
            raise HTTPException(status_code=400, detail="No questions found for this assessment")

        results = []
        total_score = 0
        total_marks = 0

        for q in questions:
            qid = q["id"]
            marks = q.get("marks", 1)
            total_marks += marks
            selected = body.answers.get(qid)
            correct = q["correct_option"]
            is_correct = selected is not None and int(selected) == correct
            earned = marks if is_correct else 0
            total_score += earned
            results.append({
                "question_id": qid,
                "question_text": q["question_text"],
                "selected_option": selected,
                "correct_option": correct,
                "is_correct": is_correct,
                "marks": marks,
                "earned": earned,
            })

        payload = with_ids({
            "candidate_id": body.candidate_id,
            "assessment_id": body.assessment_id,
            "answers": body.answers,
            "score": total_score,
            "total_marks": total_marks,
            "submitted_at": now_iso(),
        })
        db.mcq_submissions.insert_one(payload)

        return {
            "score": total_score,
            "total_marks": total_marks,
            "percentage": round((total_score / total_marks) * 100, 1) if total_marks else 0,
            "results": results,
            "submission_id": payload["id"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mcq/results/{assessment_id}")
def get_mcq_results(assessment_id: str):
    try:
        submissions = serialize_many(
            db.mcq_submissions.find({"assessment_id": assessment_id}).sort("submitted_at", -1)
        )
        candidates = {
            c["id"]: c
            for c in serialize_many(db.candidates.find({}, {"id": 1, "name": 1, "email": 1}))
        }
        return [
            {
                **sub,
                "candidate_name": candidates.get(sub["candidate_id"], {}).get("name", "Unknown"),
                "candidate_email": candidates.get(sub["candidate_id"], {}).get("email", ""),
            }
            for sub in submissions
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mcq/results")
def get_all_mcq_results():
    try:
        submissions = serialize_many(
            db.mcq_submissions.find().sort("submitted_at", -1)
        )
        candidates = {
            c["id"]: c
            for c in serialize_many(db.candidates.find({}, {"id": 1, "name": 1, "email": 1}))
        }
        assessments = {
            a["id"]: a["title"]
            for a in serialize_many(db.assessments.find({}, {"id": 1, "title": 1}))
        }
        candidate_assessments_map = {
            f"{item.get('candidate_id')}_{item.get('assessment_id')}": item
            for item in serialize_many(
                db.candidate_assessments.find(
                    {},
                    {"candidate_id": 1, "assessment_id": 1, "fullscreen_exit_count": 1, "tab_switch_count": 1, "is_banned": 1},
                )
            )
        }

        results = []
        for sub in submissions:
            ca_key = f"{sub.get('candidate_id')}_{sub.get('assessment_id')}"
            ca = candidate_assessments_map.get(ca_key, {})
            results.append({
                **sub,
                "candidate_name": candidates.get(sub["candidate_id"], {}).get("name", "Unknown"),
                "candidate_email": candidates.get(sub["candidate_id"], {}).get("email", ""),
                "assessment_title": assessments.get(sub.get("assessment_id", ""), "Unknown"),
                "fullscreen_exit_count": ca.get("fullscreen_exit_count", 0),
                "tab_switch_count": ca.get("tab_switch_count", 0),
                "is_banned": ca.get("is_banned", False),
            })

        results.sort(key=lambda r: r.get("score", 0), reverse=True)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
