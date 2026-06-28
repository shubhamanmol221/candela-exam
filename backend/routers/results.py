from collections import defaultdict

from fastapi import APIRouter, HTTPException
from database import db, serialize_many

router = APIRouter()

def submission_timestamp(submission):
    return submission.get("submitted_at") or submission.get("created_at") or ""

def best_attempt_key(attempt):
    return (attempt.get("score", 0), submission_timestamp(attempt))

@router.get("/results")
def get_results():
    try:
        submissions = serialize_many(db.submissions.find().sort("submitted_at", -1))

        candidates = {
            c["id"]: c
            for c in serialize_many(db.candidates.find({}, {"id": 1, "name": 1, "email": 1}))
        }

        questions = {
            q["id"]: q
            for q in serialize_many(db.questions.find({}, {"id": 1, "assessment_id": 1, "title": 1, "marks": 1}))
        }
        questions_by_assessment = defaultdict(list)
        for question in questions.values():
            questions_by_assessment[question.get("assessment_id")].append(question)

        assessment_map = {
            a["id"]: a["title"]
            for a in serialize_many(db.assessments.find({}, {"id": 1, "title": 1}))
        }
        candidate_assessments = {
            f"{item.get('candidate_id')}_{item.get('assessment_id')}": item
            for item in serialize_many(
                db.candidate_assessments.find(
                    {},
                    {"candidate_id": 1, "assessment_id": 1, "fullscreen_exit_count": 1, "tab_switch_count": 1, "is_banned": 1},
                )
            )
        }

        candidate_assessment_scores = defaultdict(
            lambda: {
                "candidate": None,
                "assessment_id": None,
                "attempts_by_question": defaultdict(list),
            }
        )

        for sub in submissions:
            candidate = candidates.get(sub.get("candidate_id"), {})
            question = questions.get(sub.get("question_id"), {})
            assessment_id = question.get("assessment_id")
            if not assessment_id:
                continue

            key = f"{sub['candidate_id']}_{assessment_id}"

            candidate_assessment_scores[key]["candidate"] = candidate
            candidate_assessment_scores[key]["candidate_id"] = sub["candidate_id"]
            candidate_assessment_scores[key]["assessment_id"] = assessment_id
            candidate_assessment_scores[key]["attempts_by_question"][sub.get("question_id")].append({
                "submission_id": sub.get("id"),
                "question_id": sub.get("question_id"),
                "question_title": question.get("title", "Unknown question"),
                "language": sub.get("language", ""),
                "code": sub.get("code", ""),
                "score": sub.get("score", 0),
                "marks": question.get("marks", 0),
                "passed_count": sub.get("passed_count", 0),
                "failed_count": sub.get("failed_count", 0),
                "submitted_at": sub.get("submitted_at") or sub.get("created_at"),
            })

        results = []
        for data in candidate_assessment_scores.values():
            total_score = 0
            assessment_questions = questions_by_assessment.get(data["assessment_id"], [])
            total_marks = sum(question.get("marks", 0) for question in assessment_questions)
            question_results = []

            for attempts in data["attempts_by_question"].values():
                latest_first_attempts = sorted(attempts, key=submission_timestamp, reverse=True)
                best_attempt = max(attempts, key=best_attempt_key)
                question_result = {
                    **best_attempt,
                    "attempt_count": len(latest_first_attempts),
                    "attempts": latest_first_attempts,
                    "scoring_policy": "best_attempt",
                }

                total_score += question_result["score"]
                question_results.append(question_result)

            submitted_question_ids = {result["question_id"] for result in question_results}
            for question in assessment_questions:
                if question.get("id") in submitted_question_ids:
                    continue

                question_results.append({
                    "submission_id": None,
                    "question_id": question.get("id"),
                    "question_title": question.get("title", "Unknown question"),
                    "language": "",
                    "code": "",
                    "score": 0,
                    "marks": question.get("marks", 0),
                    "passed_count": 0,
                    "failed_count": 0,
                    "submitted_at": None,
                    "attempt_count": 0,
                    "attempts": [],
                    "scoring_policy": "not_submitted",
                })

            question_results.sort(key=lambda result: result["question_title"])
            percentage = round((total_score / total_marks) * 100, 1) if total_marks > 0 else 0

            results.append({
                "candidate_id": data["candidate_id"],
                "candidate_name": data["candidate"].get("name", "Unknown") if data["candidate"] else "Unknown",
                "candidate_email": data["candidate"].get("email", "") if data["candidate"] else "",
                "assessment_id": data["assessment_id"],
                "assessment_title": assessment_map.get(data["assessment_id"], "Unknown"),
                "fullscreen_exit_count": candidate_assessments.get(
                    f"{data['candidate_id']}_{data['assessment_id']}", {}
                ).get("fullscreen_exit_count", 0),
                "tab_switch_count": candidate_assessments.get(
                    f"{data['candidate_id']}_{data['assessment_id']}", {}
                ).get("tab_switch_count", 0),
                "is_banned": candidate_assessments.get(
                    f"{data['candidate_id']}_{data['assessment_id']}", {}
                ).get("is_banned", False),
                "total_score": total_score,
                "total_marks": total_marks,
                "percentage": percentage,
                "question_results": question_results,
            })

        results.sort(key=lambda x: x["total_score"], reverse=True)

        for i, r in enumerate(results, 1):
            r["rank"] = i

        scores = [r["total_score"] for r in results]
        stats = {
            "total_candidates": len(set(r["candidate_id"] for r in results)),
            "average_score": round(sum(scores) / len(scores), 2) if scores else 0,
            "highest_score": max(scores) if scores else 0,
            "lowest_score": min(scores) if scores else 0,
        }

        return {"results": results, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
