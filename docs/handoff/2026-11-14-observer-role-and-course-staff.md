# Observer role (done) and per-course teacher permissions (design, not built)

Date: 2026-11-14. Owner approved both items.

## 1. Observer role — shipped

`users.role = 'observer'`: a read-only back-office account with **no course access**. Use it for people who
should see how the back office and the teaching materials work, but must not see students.

| | Observer may | Observer may not |
|---|---|---|
| Pages | 教材 › 教材管理 (library, read only), 語音念法 / TTS settings (read only), the old question bank data the dashboard loads (`/teacher/content`) | 遊戲數據, 班級 (courses, rosters, accounts), 系統, story editor |
| API | `GET /teacher/library`, `GET /teacher/library/{game}/{topic_id}`, `GET /teacher/content`, `GET /teacher/speech`, `GET /teacher/tts` | every other `/teacher/*` and `/learning/*` endpoint that calls `require_teacher`, every non-GET request, every export (`export.xlsx`, `metrics.csv`, `download.zip`) |

How it works: middleware `remember_request_line` stores the request method and path in a context variable;
`require_teacher()` admits `observer` only when `observer_may(method, path)` matches `OBSERVER_READ_PATHS`
(GET only). Deny by default: a new teacher endpoint is closed to observers unless it is added to that regex.
The dashboard hides the closed menus and opens on 教材管理; that is cosmetic, the server is the gate.

Create one: 帳號管理 › role dropdown › "Observer（唯讀）", or `POST /teacher/users/bulk` with `role: observer`
(admin only). Tests: `python scripts/test_observer.py` (48 checks).

## 2. Several teachers, each with their own classes — design for after the 11/18 and 11/23 trials

Today `courses.teacher_id` exists but nothing filters on it: any `teacher` sees and edits every course.

Proposal:

- New table `course_staff(course_id, user_id, role, created_at)`, unique `(course_id, user_id)`.
  `role` is one of `owner` (full control of the course), `co` (manage students, sessions, topics; cannot
  delete the course or change staff), `observer` (read the course, including its roster and records).
- One course can have several staff; one teacher can be on several courses. `admin` keeps access to all.
- Migration: for every course with a `teacher_id`, insert `(course_id, teacher_id, 'owner')`; C/D/E (ids 2/3/4)
  get Cathy as owner. Keep `courses.teacher_id` as the display "授課老師" for now.
- One helper, `course_role(user, course_id)`, returns `admin | owner | co | observer | None`. Every
  course-scoped endpoint (courses, roster, enrollments, sessions, reports, learning records, recordings,
  chips, feedback; about 60 endpoints) checks it; list endpoints filter to the user's courses.
- Records that are not tied to a course (guest play, self-registered users) stay visible to admin only.
- The global `observer` role from part 1 stays as is: back office without any course.
- UI: course page gets a "老師" tab (owner adds / removes staff by e-mail and picks the role).
- Tests: one script that builds two teachers and two courses and checks every endpoint both ways.

Order of work: table + migration + helper with tests, then endpoints module by module (classroom,
course_plan, learning reports, recordings, reports), then UI. Not before the 11/23 trial.
