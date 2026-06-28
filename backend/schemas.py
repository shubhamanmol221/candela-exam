from typing import Any, List, Optional

from pydantic import BaseModel, field_validator, model_validator

class AdminLogin(BaseModel):
    username: str
    password: str

class AssessmentCreate(BaseModel):
    title: str
    description: str = ""
    duration: int = 60
    type: str = "coding"


class MCQOptionItem(BaseModel):
    text: str


class MCQQuestionCreate(BaseModel):
    assessment_id: str
    question_text: str
    options: List[str]
    correct_option: int
    marks: int = 1


class MCQSubmitRequest(BaseModel):
    candidate_id: str
    assessment_id: str
    answers: dict

class QuestionCreate(BaseModel):
    assessment_id: str
    title: str
    problem_statement: str = ""
    input_format: str = ""
    output_format: str = ""
    constraints: str = ""
    marks: int = 10

class TestCaseCreate(BaseModel):
    question_id: str
    input_data: str = ""
    expected_output: str = ""
    explanation: str = ""
    is_hidden: bool = False

    @model_validator(mode="before")
    @classmethod
    def normalize_explanation(cls, data: Any):
        if isinstance(data, dict) and "explanation" not in data and "explaination" in data:
            data = {**data, "explanation": data.get("explaination")}
        return data

class QuestionTestCaseUpload(BaseModel):
    input_data: str = ""
    expected_output: str = ""
    explanation: str = ""
    is_hidden: bool = False

    @model_validator(mode="before")
    @classmethod
    def normalize_explanation(cls, data: Any):
        if isinstance(data, dict) and "explanation" not in data and "explaination" in data:
            data = {**data, "explanation": data.get("explaination")}
        return data

class QuestionUpload(BaseModel):
    title: str
    problem_statement: str = ""
    input_format: str = ""
    output_format: str = ""
    constraints: str = ""
    marks: int = 10
    test_cases: List[QuestionTestCaseUpload] = []

class BulkQuestionUpload(BaseModel):
    assessment_id: str
    questions: List[QuestionUpload]

class CandidateLogin(BaseModel):
    name: str
    email: str
    resume_password: Optional[str] = None

class RunCodeRequest(BaseModel):
    code: str
    language: str
    input_data: str = ""
    candidate_id: str = ""
    question_id: str = ""

    @field_validator("code", "language", "input_data", "candidate_id", "question_id", mode="before")
    @classmethod
    def stringify_run_values(cls, value):
        if value is None:
            return ""
        return str(value)

class SubmitCodeRequest(BaseModel):
    candidate_id: str = ""
    question_id: str = ""
    assessment_id: str = ""
    language: str = "python"
    code: str = ""

    @field_validator("candidate_id", "question_id", "assessment_id", "language", "code", mode="before")
    @classmethod
    def stringify_values(cls, value):
        if value is None:
            return ""
        return str(value)
