# InterviewPrep — Frontend

> AI-powered interview preparation platform. Paste your resume, get personalised questions, answer by voice or text, receive instant AI feedback.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat-square&logo=tailwind-css)

---

## What This Repo Does

This is the frontend of the InterviewPrep platform. It handles:

- Public landing page with animated particle background
- User signup and login flows
- Protected dashboard where users practice interviews
- Resume input (text), AI question generation, voice/text answers
- Real-time AI evaluation with score, feedback, and improvement tips

The frontend communicates with the Express backend over HTTP using JWT tokens for authentication.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16 | React framework, file-based routing, SSR |
| React 18 | Component-based UI, hooks |
| Tailwind CSS | Utility-first styling |
| Web Speech API | Browser-native speech to text |
| localStorage | JWT token persistence between sessions |

---

## Project Structure

```
app/
├── page.js              # Landing page (public)
├── login/
│   └── page.js          # Login page
├── signup/
│   └── page.js          # Signup page
└── dashboard/
    └── page.js          # Main interview prep UI (protected)
```

Each folder inside `app/` maps directly to a URL route — this is Next.js file-based routing. No router configuration needed.

---

## Pages

### `/` — Landing page
Public-facing marketing page. Dark theme with animated green particles. Features section, CTA buttons linking to signup and login. No authentication required.

### `/signup` — Signup
Email and password form. Calls `POST /signup` on the backend. On success, redirects to `/login`.

### `/login` — Login
Email and password form. Calls `POST /login` on the backend. On success, stores JWT token and email in `localStorage`, redirects to `/dashboard`.

### `/dashboard` — Interview prep (protected)
Main application. Checks for token in `localStorage` on load — redirects to `/login` if missing. Features:
- Resume textarea input
- Generate questions button (calls Gemini API via backend)
- Per-question answer textarea
- Speak Answer button (Web Speech API, manual start/stop)
- Evaluate Answer button (calls Gemini evaluation via backend)
- Score display with color coding (green 8-10, yellow 5-7, red 1-4)
- Logout button

---

## Coding Style

### Components
Every page is a single default-exported React function component. No class components.

```jsx
export default function PageName() {
  // state declarations
  // functions
  // return JSX
}
```

### State management
All state is local using `useState`. No external state library (Redux, Zustand etc.) — the app is simple enough that local state is sufficient.

```jsx
const [questions, setQuestions] = useState([])
const [answers, setAnswers] = useState({})     // object keyed by question index
const [evaluations, setEvaluations] = useState({})
```

### Data fetching
All API calls use `fetch()` with `async/await`. JWT token is attached to every protected request via the `Authorization` header.

```javascript
const response = await fetch("http://localhost:4000/route", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`
  },
  body: JSON.stringify({ key: value })
})
const data = await response.json()
```

### Route protection
Protected pages check for a token in `useEffect` on load:

```javascript
useEffect(() => {
  const token = localStorage.getItem("token")
  if (!token) router.push("/login")
}, [])
```

### Styling
Tailwind CSS utility classes for most elements. Inline `style` objects used for dynamic values (e.g. score color based on score value) and for the landing page where precise dark-theme hex values are needed.

```jsx
// Tailwind for static styles
<button className="bg-blue-600 text-white px-4 py-2 rounded-lg">

// Inline style for dynamic values
<span style={{ color: getScoreColor(score) }}>
```

### Functions
Arrow functions for pure utilities, regular `async function` declarations for event handlers and API calls.

```javascript
// utility — arrow function
const getScoreColor = (score) => {
  const colors = { high: "#16a34a", mid: "#ca8a04", low: "#dc2626" }
  return score >= 8 ? colors.high : score >= 5 ? colors.mid : colors.low
}

// event handler — async function declaration
async function generateQuestions() {
  // ...
}
```

---

## Getting Started

### Prerequisites
- Node.js v18+
- The backend server running on port 4000 ([interview-backend repo](https://github.com/Sionigdha/interview-backend))

### Installation

```bash
git clone https://github.com/Sionigdha/interview-prep.git
cd interview-prep
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment
No `.env` file needed for the frontend — the backend URL is currently hardcoded as `http://localhost:4000`. For production, this should be moved to an environment variable.

---

## Backend
The backend repo lives at [github.com/Sionigdha/interview-backend](https://github.com/Sionigdha/interview-backend). It must be running before the frontend will work.

---

## Author
Snigdha Sadhukhan — 3rd Year B.Tech CSE (IoT), Institute of Engineering and Management, Kolkata
