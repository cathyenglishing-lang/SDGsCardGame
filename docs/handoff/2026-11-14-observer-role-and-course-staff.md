# Observer role (done) and per-course teacher permissions (design, not built)

Date: 2026-11-14. Owner approved both items.

## 1. Observer role — shipped

`users.role = 'observer'`: the whole back office **read-only**, except the class side (班級). Use it for
people who should watch how the system is used without managing courses or accounts.

| | Observer may (GET only) | Observer may not |
|---|---|---|
| Pages | 遊戲數據 (Card Game, 3D Harbor, SDG 4 Stage, story routes, recording playback), 教材, 語音念法, 系統 (resources, visitors, database ER, login records, settings) | 班級: 課程與名單, 帳號管理; course meeting times, sessions, calendar, who-played reports; chips |
| API | every `require_teacher` GET outside `OBSERVER_CLOSED` | `/teacher/courses*`, `enrollments`, `sessions`, `calendar`, `roster`, `users*`, `chips`, `user-anomalies`; every `.xlsx` / `.csv` / `.zip`; every non-GET request |

Owner approved (2026-11-14) that game data and login records still show student names and e-mails.

How it works: middleware `remember_request_line` stores the request method and path in a context variable;
`require_teacher()` admits `observer` only when `observer_may(method, path)`: GET and not matching
`OBSERVER_CLOSED`. The admin-only read checks in `metrics.py` and `visits.py` also admit observer. The dashboard
shows the 系統 menu to observers and hides 班級; that is cosmetic, the server is the gate. When you add a new
class-side endpoint, add its path to `OBSERVER_CLOSED`.

Create one: 帳號管理 › role dropdown › "Observer（唯讀）", or `POST /teacher/users/bulk` with `role: observer`
(admin only). Tests: `python scripts/test_observer.py`.

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
