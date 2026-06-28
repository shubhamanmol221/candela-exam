import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient
from pymongo.database import Database

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "codeassess")

client: MongoClient = MongoClient(MONGODB_URI)
db: Database = client[MONGODB_DB]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(ObjectId())


def with_ids(data: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(data)
    item_id = item.get("id") or new_id()
    item["_id"] = ObjectId(item_id) if ObjectId.is_valid(item_id) else ObjectId()
    item["id"] = item_id
    return item


def serialize_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None

    serialized = dict(doc)
    object_id = serialized.pop("_id", None)
    serialized["id"] = serialized.get("id") or str(object_id)
    return serialized


def serialize_many(docs: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [serialize_doc(doc) for doc in docs if doc is not None]


def id_filter(item_id: str) -> Dict[str, Any]:
    filters: List[Dict[str, Any]] = [{"id": item_id}]
    if ObjectId.is_valid(item_id):
        filters.append({"_id": ObjectId(item_id)})
    return {"$or": filters}


def create_indexes() -> None:
    db.admins.create_index([("username", ASCENDING)], unique=True)
    db.assessments.create_index([("id", ASCENDING)], unique=True)
    db.assessments.create_index([("created_at", ASCENDING)])
    db.questions.create_index([("assessment_id", ASCENDING), ("created_at", ASCENDING)])
    db.test_cases.create_index([("question_id", ASCENDING), ("created_at", ASCENDING)])
    db.candidates.create_index([("email", ASCENDING)], unique=True)
    db.candidate_assessments.create_index(
        [("candidate_id", ASCENDING), ("assessment_id", ASCENDING)],
        unique=True,
    )
    db.submissions.create_index([("submitted_at", ASCENDING)])
    db.submissions.create_index([("candidate_id", ASCENDING), ("question_id", ASCENDING)])


create_indexes()
