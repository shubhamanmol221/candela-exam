from fastapi import APIRouter, HTTPException
from database import db, id_filter, now_iso, serialize_doc, serialize_many, with_ids
from schemas import TestCaseCreate

router = APIRouter()

@router.post("/testcases")
def create_testcase(body: TestCaseCreate):
    try:
        payload = with_ids({**body.model_dump(), "created_at": now_iso()})
        db.test_cases.insert_one(payload)
        return serialize_doc(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/testcases/{question_id}")
def get_testcases(question_id: str):
    try:
        docs = db.test_cases.find({"question_id": question_id}).sort("created_at", 1)
        return serialize_many(docs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/testcases/public/{question_id}")
def get_public_testcases(question_id: str):
    try:
        docs = db.test_cases.find({"question_id": question_id, "is_hidden": False}).sort("created_at", 1)
        return serialize_many(docs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/testcases/{testcase_id}")
def update_testcase(testcase_id: str, body: dict):
    try:
        allowed = {"question_id", "input_data", "expected_output", "explanation", "is_hidden"}
        update_data = {
            key: value
            for key, value in body.items()
            if key in allowed and value is not None
        }
        if not update_data:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        update_data["updated_at"] = now_iso()
        res = db.test_cases.update_one(id_filter(testcase_id), {"$set": update_data})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Test case not found")

        return serialize_doc(db.test_cases.find_one(id_filter(testcase_id)))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/testcases/{testcase_id}")
def delete_testcase(testcase_id: str):
    try:
        res = db.test_cases.delete_one(id_filter(testcase_id))
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Test case not found")

        return {"message": "Test case deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
