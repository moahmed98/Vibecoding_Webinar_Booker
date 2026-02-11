# 📅 Codebasics Event Booking Portal

An internal tool for scheduling and managing webinars at Codebasics. Checks availability against a centralized Notion calendar and triggers operations workflows via Process Street.

## Features

- **Availability Check** — Validates against existing events in Notion to prevent scheduling conflicts
- **Smart Date Validation** — Automatically blocks Thursdays after 6:00 PM
- **Notion Integration** — Creates event entries with title, dates, webinar type, bootcamp name, and guest LinkedIn
- **Process Street Webhook** — Triggers operations pipeline on booking confirmation
- **Codebasics Branded UI** — Dark navy theme with official brand colors, fonts (Saira Condensed + Kanit), and glassmorphic card design

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | Notion API |
| Ops Workflow | Process Street (Webhook) |

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env` file:
```
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_notion_database_id
PORT=3000
```

### 4. Run the server
```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── public/
│   ├── index.html       # Main UI (Codebasics branded)
│   ├── script.js        # Frontend logic & form handling
│   └── logo.png         # Logo asset
├── server.js            # Express server, Notion & Process Street APIs
├── .env                 # Environment variables (not committed)
├── package.json         # Dependencies
└── README.md
```

## How It Works

1. User fills in webinar title, date/time (2×2 grid), and clicks **Check Availability**
2. Backend queries Notion database for scheduling conflicts
3. If available, extended form appears (webinar type, bootcamp name, LinkedIn)
4. On **Confirm Booking**, event is created in Notion
5. User can trigger **Process Street** operations workflow via webhook

---

Built for **Codebasics** · *Enabling Careers*
