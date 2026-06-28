import os

from fastapi import APIRouter, HTTPException
from pymongo.errors import DuplicateKeyError

from database import db, now_iso, serialize_doc, serialize_many, with_ids
from schemas import CandidateLogin

router = APIRouter()

CANDIDATE_RESUME_PASSWORD = os.getenv("CANDIDATE_RESUME_PASSWORD", "dev@lanforge")

@router.post("/candidate/login")
def candidate_login(body: CandidateLogin):
    try:
        candidate = serialize_doc(db.candidates.find_one({"email": body.email}))
        if candidate:
            if body.resume_password != CANDIDATE_RESUME_PASSWORD:
                raise HTTPException(
                    status_code=403,
                    detail="This email is already registered. Enter the resume password to continue.",
                )

            db.candidate_assessments.update_many(
                {"candidate_id": candidate["id"], "is_banned": True},
                {"$set": {"is_banned": False, "updated_at": now_iso()}},
            )

            if candidate["name"] != body.name:
                db.candidates.update_one(
                    {"id": candidate["id"]},
                    {"$set": {"name": body.name, "updated_at": now_iso()}},
                )
                return serialize_doc(db.candidates.find_one({"id": candidate["id"]}))
            return candidate

        payload = with_ids({"name": body.name, "email": body.email, "created_at": now_iso()})
        db.candidates.insert_one(payload)
        return serialize_doc(payload)
    except DuplicateKeyError:
        candidate = serialize_doc(db.candidates.find_one({"email": body.email}))
        if candidate:
            raise HTTPException(
                status_code=403,
                detail="This email is already registered. Enter the resume password to continue.",
            )
        raise HTTPException(status_code=409, detail="Candidate email already exists")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/candidate/assessment/{assessment_id}")
def get_candidate_assessment(assessment_id: str):
    try:
        assessment = serialize_doc(db.assessments.find_one({"id": assessment_id}))
        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")

        questions = serialize_many(db.questions.find({"assessment_id": assessment_id}).sort("created_at", 1))

        for q in questions:
            visible_test_cases = serialize_many(
                db.test_cases.find(
                    {"question_id": q["id"], "is_hidden": False},
                    {"id": 1, "input_data": 1, "expected_output": 1, "explanation": 1},
                ).sort("created_at", 1)
            )
            q["sample_test_cases"] = visible_test_cases

        assessment["questions"] = questions
        return assessment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/candidate/start/{assessment_id}")
def start_assessment(assessment_id: str, candidate_id: str):
    try:
        existing = serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        )
        if existing:
            if existing.get("finished_at"):
                raise HTTPException(status_code=403, detail="This assessment has already been ended for this candidate")
            return existing

        payload = with_ids({
            "candidate_id": candidate_id,
            "assessment_id": assessment_id,
            "fullscreen_exit_count": 0,
            "tab_switch_count": 0,
            "is_banned": False,
            "started_at": now_iso(),
            "created_at": now_iso(),
        })
        db.candidate_assessments.insert_one(payload)
        return serialize_doc(payload)
    except DuplicateKeyError:
        existing = serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        ) or {}
        if existing.get("finished_at"):
            raise HTTPException(status_code=403, detail="This assessment has already been ended for this candidate")
        return existing
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/candidate/fullscreen-exit/{assessment_id}")
def record_fullscreen_exit(assessment_id: str, candidate_id: str, count: int):
    try:
        if count < 0:
            raise HTTPException(status_code=400, detail="Fullscreen exit count cannot be negative")

        existing = serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        )
        if not existing:
            raise HTTPException(status_code=403, detail="Assessment has not been started for this candidate")

        db.candidate_assessments.update_one(
            {"candidate_id": candidate_id, "assessment_id": assessment_id},
            {
                "$max": {"fullscreen_exit_count": count},
                "$set": {"updated_at": now_iso()},
            },
        )

        return serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/candidate/tab-switch/{assessment_id}")
def record_tab_switch(assessment_id: str, candidate_id: str, count: int):
    try:
        if count < 0:
            raise HTTPException(status_code=400, detail="Tab switch count cannot be negative")

        existing = serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        )
        if not existing:
            raise HTTPException(status_code=403, detail="Assessment has not been started for this candidate")

        db.candidate_assessments.update_one(
            {"candidate_id": candidate_id, "assessment_id": assessment_id},
            {
                "$max": {"tab_switch_count": count},
                "$set": {"updated_at": now_iso()},
            },
        )

        return serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidate/ban/{assessment_id}")
def ban_candidate(assessment_id: str, candidate_id: str):
    try:
        existing = serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        )
        if not existing:
            raise HTTPException(status_code=403, detail="Assessment has not been started for this candidate")

        db.candidate_assessments.update_one(
            {"candidate_id": candidate_id, "assessment_id": assessment_id},
            {"$set": {"is_banned": True, "updated_at": now_iso()}},
        )
        return serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidate/end/{assessment_id}")
def end_assessment(assessment_id: str, candidate_id: str):
    try:
        existing = serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        )
        if not existing:
            raise HTTPException(status_code=403, detail="Assessment has not been started for this candidate")

        if existing.get("finished_at"):
            return existing

        db.candidate_assessments.update_one(
            {"candidate_id": candidate_id, "assessment_id": assessment_id},
            {"$set": {"finished_at": now_iso(), "updated_at": now_iso()}},
        )
        return serialize_doc(
            db.candidate_assessments.find_one(
                {"candidate_id": candidate_id, "assessment_id": assessment_id}
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
