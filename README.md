# 📅 Codebasics Webinar Management System

An internal tool for scheduling webinars and managing operations checklists. Built on **Supabase** with a Process Street-inspired operations panel.

## Features

- **Availability Check** — Prevents double-booking with overlap detection
- **Smart Date Validation** — Blocks Thursdays after 6:00 PM
- **Supabase Integration** — All data persisted to PostgreSQL via Supabase
- **Operations Control Panel** — Dynamic checklists with nested sub-items
- **Progress Tracking** — Real-time progress bar across all checklist items
- **Codebasics Branded UI** — Dark navy theme with official brand colors and fonts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | Supabase (PostgreSQL) |
| Styling | Saira Condensed + Kanit fonts |

## Setup

### 1. Clone & install
```bash
git clone https://github.com/moahmed98/Vibecoding_Webinar_Booker.git
cd Vibecoding_Webinar_Booker
npm install
```

### 2. Configure `.env`
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
PORT=3000
```

### 3. Create Supabase tables
Run the SQL in `setup-supabase.js` (or see the SQL section in the script) via your Supabase Dashboard SQL Editor.

### 4. Start
```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000)

## How It Works

1. **Book** — Fill in webinar details, check availability, confirm
2. **Operate** — After booking, the Operations Control Panel appears
3. **Create Checklists** — Dynamic, named checklists (e.g., "Pre-Event", "Marketing")
4. **Add Tasks** — Add items and nest sub-items within items
5. **Track Progress** — Progress bar fills as tasks are completed
6. **Persist** — All checkbox states saved to Supabase in real-time

---

Built for **Codebasics** · *Enabling Careers*
