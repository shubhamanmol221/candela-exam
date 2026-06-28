# CodeAssess - Coding Assessment Platform

A full-stack coding assessment platform for technical hiring. Admins create assessments, candidates solve coding challenges with automatic test case evaluation.

## Architecture

```
Frontend (React+Vite)  ←→  Backend (FastAPI)  ←→  Database (MongoDB)
   :5173                       :8000
```

## Quick Start

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with your MongoDB connection
cat > .env << 'EOF'
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=codeassess
JWT_SECRET=coding-assessment-secret-key-2024
EOF

# Start the server
uvicorn main:app --reload --port 8000
```

### 2. Initialize Admin Account

In a separate terminal:

```bash
curl -X POST http://localhost:8000/admin/setup-password \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 3. Frontend Setup

```bash
# From project root
npm install
npm run dev
```

Visit: `http://localhost:5173`

---

## Usage

### Admin Portal
- **URL:** `http://localhost:5173/admin/login`
- **Credentials:** `admin` / `admin123` (after setup)
- Create assessments with title, description, duration
- Add questions with detailed problem statements
- Define test cases (visible/hidden)
- View candidate results and export CSV

### Candidate Portal
- **URL:** `http://localhost:5173/login`
- Enter name, email, assessment ID (shared by recruiter)
- View problem statement with samples
- Write code in Python/JavaScript/C++/Java
- Run code with custom input
- Submit for auto-evaluation

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | TailwindCSS |
| HTTP | Axios |
| Routing | React Router v7 |
| Backend | FastAPI (Python) |
| Database | MongoDB |
| Auth | JWT (admin) / session (candidate) |
| Code Execution | subprocess (Python fully supported, others require system dependencies) |

---

## Database Schema

- **admins** - Admin users
- **assessments** - Coding tests (title, description, duration)
- **questions** - Individual problems (problem_statement, marks, constraints)
- **test_cases** - Evaluation cases (input/output, hidden flag)
- **candidates** - Test takers (name, email)
- **candidate_assessments** - Tracks assessment participation
- **submissions** - Code submissions with scores

MongoDB collections are created automatically on first insert. The backend creates indexes for admin usernames, candidate emails, assessment participation, and submission lookups.

---

## Scoring Formula

```
Question Score = (Passed Test Cases / Total Test Cases) × Marks
```

Example: 8/10 test cases pass on a 20-mark question → Score: 16

---

## Features

✅ Admin dashboard with stats  
✅ Assessment & question management  
✅ Flexible test case creation  
✅ Auto-scoring on submission  
✅ Candidate leaderboard with rankings  
✅ Results export to CSV  
✅ Code execution with timeout protection  
✅ Session management  
✅ Responsive design

---

## Troubleshooting

**Backend won't connect?**
- Ensure MongoDB is running and `MONGODB_URI` is set in `backend/.env`
- For local development, `mongodb://localhost:27017` is the default connection

**Admin login fails?**
- Run the setup endpoint again:
  ```bash
  curl -X POST http://localhost:8000/admin/setup-password \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"newpassword"}'
  ```

**Code execution fails?**
- Python is always supported
- For C++: install `g++` → `sudo apt install build-essential`
- For Java: install JDK → `sudo apt install default-jdk`
- For Node.js: `sudo apt install nodejs`
