import secrets

from fastapi import APIRouter, HTTPException
from pymongo.errors import DuplicateKeyError

from database import db, id_filter, now_iso, serialize_doc, serialize_many, with_ids
from schemas import AssessmentCreate

router = APIRouter()

ASSESSMENT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ASSESSMENT_ID_LENGTH = 6


def generate_assessment_id() -> str:
    for _ in range(20):
        assessment_id = "".join(secrets.choice(ASSESSMENT_ID_ALPHABET) for _ in range(ASSESSMENT_ID_LENGTH))
        if not db.assessments.find_one({"id": assessment_id}, {"_id": 1}):
            return assessment_id

    raise RuntimeError("Could not generate a unique assessment ID")


@router.post("/assessments")
def create_assessment(body: AssessmentCreate):
    try:
        payload = with_ids({**body.model_dump(), "id": generate_assessment_id(), "created_at": now_iso()})
        db.assessments.insert_one(payload)
        return serialize_doc(payload)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Assessment ID collision. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assessments")
def list_assessments():
    try:
        docs = db.assessments.find().sort("created_at", -1)
        return serialize_many(docs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assessments/{assessment_id}")
def get_assessment(assessment_id: str):
    try:
        assessment = serialize_doc(db.assessments.find_one(id_filter(assessment_id)))
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")
        return assessment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/assessments/{assessment_id}")
def update_assessment(assessment_id: str, body: dict):
    try:
        update_data = {
            key: value
            for key, value in body.items()
            if key in {"title", "description", "duration", "type"} and value is not None
        }
        if not update_data:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        update_data["updated_at"] = now_iso()
        res = db.assessments.update_one(id_filter(assessment_id), {"$set": update_data})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Assessment not found")

        return serialize_doc(db.assessments.find_one(id_filter(assessment_id)))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/assessments/{assessment_id}")
def delete_assessment(assessment_id: str):
    try:
        assessment = serialize_doc(db.assessments.find_one(id_filter(assessment_id)))
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")

        question_ids = [
            question["id"]
            for question in serialize_many(db.questions.find({"assessment_id": assessment["id"]}))
        ]
        if question_ids:
            db.test_cases.delete_many({"question_id": {"$in": question_ids}})
            db.submissions.delete_many({"question_id": {"$in": question_ids}})

        db.questions.delete_many({"assessment_id": assessment["id"]})
        db.mcq_questions.delete_many({"assessment_id": assessment["id"]})
        db.mcq_submissions.delete_many({"assessment_id": assessment["id"]})
        db.candidate_assessments.delete_many({"assessment_id": assessment["id"]})
        db.assessments.delete_one(id_filter(assessment_id))
        return {"message": "Assessment deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
