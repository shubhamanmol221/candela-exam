from fastapi import APIRouter, HTTPException
from database import db, id_filter, now_iso, serialize_doc, serialize_many, with_ids
from schemas import BulkQuestionUpload, QuestionCreate

router = APIRouter()

@router.post("/questions")
def create_question(body: QuestionCreate):
    try:
        payload = with_ids({**body.model_dump(), "created_at": now_iso()})
        db.questions.insert_one(payload)
        return serialize_doc(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/questions/bulk")
def upload_questions(body: BulkQuestionUpload):
    if not body.questions:
        raise HTTPException(status_code=400, detail="At least one question is required")

    created_questions = []
    created_test_cases = 0

    try:
        for question in body.questions:
            question_data = question.model_dump(exclude={"test_cases"})
            question_data["assessment_id"] = body.assessment_id
            question_data["created_at"] = now_iso()

            question_doc = with_ids(question_data)
            db.questions.insert_one(question_doc)
            created_question = serialize_doc(question_doc)
            test_cases = [
                with_ids({
                    **test_case.model_dump(),
                    "question_id": created_question["id"],
                    "created_at": now_iso(),
                })
                for test_case in question.test_cases
            ]

            if test_cases:
                insert_res = db.test_cases.insert_many(test_cases)
                created_test_cases += len(insert_res.inserted_ids)

            created_question["test_cases_count"] = len(test_cases)
            created_questions.append(created_question)

        return {
            "created_questions": created_questions,
            "question_count": len(created_questions),
            "test_case_count": created_test_cases,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/questions/{assessment_id}")
def get_questions(assessment_id: str):
    try:
        docs = db.questions.find({"assessment_id": assessment_id}).sort("created_at", 1)
        return serialize_many(docs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/question/{question_id}")
def get_question(question_id: str):
    try:
        question = serialize_doc(db.questions.find_one(id_filter(question_id)))
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        return question
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/questions/{question_id}")
def update_question(question_id: str, body: dict):
    try:
        allowed = {
            "assessment_id",
            "title",
            "problem_statement",
            "input_format",
            "output_format",
            "constraints",
            "marks",
        }
        update_data = {
            key: value
            for key, value in body.items()
            if key in allowed and value is not None
        }
        if not update_data:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        update_data["updated_at"] = now_iso()
        res = db.questions.update_one(id_filter(question_id), {"$set": update_data})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Question not found")

        return serialize_doc(db.questions.find_one(id_filter(question_id)))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/questions/{question_id}")
def delete_question(question_id: str):
    try:
        question = serialize_doc(db.questions.find_one(id_filter(question_id)))
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        db.test_cases.delete_many({"question_id": question["id"]})
        db.submissions.delete_many({"question_id": question["id"]})
        db.questions.delete_one(id_filter(question_id))
        return {"message": "Question deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
