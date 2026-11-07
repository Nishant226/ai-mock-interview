# 🚀 InterviewIQ.AI — AI-Powered Smart Interview & Anti-Cheating Proctoring Platform

## 🌟 Live Architecture & Deployments

* **Frontend Client (Vercel):** `https://ai-mock-interview-zeta-two.vercel.app`
* **Node.js Core API (Render):** `https://ai-mock-interview-atuw.onrender.com`
* **FastAPI Vision & Audio Engine (Render):** `https://ai-mock-interview-1-99q9.onrender.com`

---

## 🎯 Key Platform Features

### 🧠 1. Adaptive AI Interview Engine
* **Multi-Dimensional Calibration:** Dynamically generates question sets tailored by **Target Role**, **Years of Experience**, and **Selected Difficulty Levels** (Easy, Medium, Hard, Expert).
* **Resume & Job Description (JD) Intelligence:** Contextually extracts candidate skills from uploaded resumes (PDF/Docx) and aligns them against target Job Descriptions to surface hyper-relevant questions.
* **Dynamic Follow-Ups & Conversational Depth:** Evaluates initial answers in real-time and triggers contextual follow-up questions to probe deeper into implementation choices and system design logic.

---

### 🎯 2. Specialized Interview Rounds & Evaluation Modules

* **💻 1. Live Coding & Algorithms Sandbox:**
  * Interactive code editor with multi-language execution support (**JavaScript, Python, C++, Java, C**).
  * Connected directly to an **OnlineCompiler REST API** isolated execution engine.
  * Real-time test case evaluation with input/output parsing and runtime performance metrics.

* **🏗️ 2. Technical Q&A & System Design:**
  * Architecture-level questions focusing on database schema design, scalability, caching, load balancing, microservices, and design patterns.
  * Deep-dive technical discussions tailored to candidate seniority and role requirements.

* **🧠 3. Aptitude & Logical Reasoning:**
  * Quantitative analysis, problem-solving puzzles, and structured analytical reasoning modules.

* **💬 4. HR & Behavioral Assessment:**
  * Situational scenarios and STAR-methodology (Situation, Task, Action, Result) response evaluations.
  * Evaluates soft skills, communication clarity, leadership traits, and cultural fit.

---

### 👁️ 3. Computer Vision & Audio Anti-Cheating Proctoring (FastAPI)

* **Real-time Facial Tracking (`face_landmarker`):** Powered by **OpenCV** and **MediaPipe** to monitor eye contact consistency, gaze direction, head orientation, and out-of-frame movement.
* **Posture & Gesture Analysis (`pose_landmarker`):** Tracks upper-body positioning, posture integrity, and suspicious physical movements during interview sessions.
* **Audio & Speech Dynamics:** Real-time microphone stream processing to evaluate speech cadence, silence intervals, filler words, and voice confidence.

---

### 📊 4. Deep Analytics, Reports & User Dashboard

* **Dynamic Evaluation Reports:** Comprehensive post-interview breakdown providing overall scores, category-wise performance, time-per-question analysis, key strengths, and actionable improvement feedback.
* **Historical Tracking & Performance Logs:** Centralized candidate dashboard tracking performance trends, historical interview scores, and improvement metrics over time.
* **Multi-Provider Authentication:** Integrated **Firebase Authentication** alongside secure **JWT token storage** for robust user session management.

---

## 🛠️ Full-Stack Technology Stack

| Layer | Technologies & Frameworks |
| :--- | :--- |
| **Frontend UI** | React.js, Vite, Tailwind CSS, Lucide Icons, Axios, Firebase Web SDK |
| **Backend API Gateway** | Node.js, Express.js, JWT Authentication, Mongoose, Nodemailer, Razorpay SDK |
| **AI & Vision Microservice** | Python 3.11+, FastAPI, OpenCV, MediaPipe, TensorFlow |
| **Code Execution Engine** | OnlineCompiler.io REST API (Isolated Sandbox Execution) |
| **Database & Auth Storage** | MongoDB Atlas (Cloud Managed Database), Firebase Auth |
| **DevOps & Infrastructure** | Docker, Docker Compose, Vercel (Frontend), Render (Microservices) |

---

## 📂 Project Architecture & Directory Structure

```text
ai-mock-interviewer/
├── .github/              # CI/CD workflows and GitHub actions configurations
├── .postman/             # Postman workspace environment profiles
├── backend/              # Node.js & Express REST API (Auth, Interview Logic, Payments, Code Sandbox)
├── frontend/             # React.js + Vite Client Application (UI Dashboard, Live Media Stream, Reports)
├── postman/              # Exported API collection files for backend routes testing
├── vision-service/       # FastAPI Microservice (MediaPipe, OpenCV, Speech & Facial Proctoring)
├── .gitignore            # Git exclusion rules
└── docker-compose.yml    # Multi-service container orchestration script
```

---

## ⚙️ Local Development Setup (Docker)

The application is containerized using Docker to launch all microservices seamlessly.

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed on your machine.

### 1. Clone Repository
```bash
git clone https://github.com/Nishant226/ai-mock-interview.git
cd ai-mock-interview
```

### 2. Configure Environment Variables
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/ai_interview_db
JWT_SECRET=your_super_secret_jwt_key
ONLINE_COMPILER_API_KEY=your_online_compiler_api_key
OPENAI_API_KEY=your_openai_or_groq_api_key
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

### 3. Spin Up Multi-Container Architecture
```bash
docker compose up --build -d
```

### 4. Local Service Endpoints
* **React Frontend App:** `http://localhost:3000`
* **Node.js Express Backend:** `http://localhost:5000`
* **FastAPI Vision Microservice:** `http://localhost:8000`

To stop all active services:
```bash
docker compose down
```

---

## 📄 Environment Variable Reference

| Variable | Target Service | Purpose |
| :--- | :--- | :--- |
| `MONGO_URI` | Node.js Backend | Database connection string for MongoDB Atlas |
| `JWT_SECRET` | Node.js Backend | Cryptographic secret for user token signatures |
| `ONLINE_COMPILER_API_KEY` | Node.js Backend | Authorization token for code sandbox compilation |
| `OPENAI_API_KEY` | Node.js Backend | API key for AI question generation & answer grading |
| `VITE_API_URL` | React Frontend | Production/Local Node.js API base endpoint |
| `VITE_FASTAPI_URL` | React Frontend | Production/Local FastAPI Vision service endpoint |

---

## 👩‍💻 Author

* **Nishant Chaudhary**
  * Full-Stack Software Engineer specializing in MERN Stack, Scalable Microservices, and AI-Driven Proctoring Systems.