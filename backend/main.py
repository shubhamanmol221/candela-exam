import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import auth, assessments, questions, testcases, candidates, submissions, results, mcq

app = FastAPI(title="CodeAssess API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(assessments.router)
app.include_router(questions.router)
app.include_router(testcases.router)
app.include_router(candidates.router)
app.include_router(submissions.router)
app.include_router(results.router)
app.include_router(mcq.router)

@app.get("/health")
def health():
    return {"status": "ok"}
