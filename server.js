require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const apiKey = process.env.NOTION_API_KEY;
const databaseId = process.env.NOTION_DATABASE_ID;

// Helper function to call Notion API
async function notionRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
        }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(`https://api.notion.com/v1/${endpoint}`, options);
    return response.json();
}

// Check if two time ranges overlap
function timesOverlap(existingStart, existingEnd, requestedStart, requestedEnd) {
    // Convert to timestamps for comparison
    const eStart = new Date(existingStart).getTime();
    const eEnd = new Date(existingEnd).getTime();
    const rStart = new Date(requestedStart).getTime();
    const rEnd = new Date(requestedEnd).getTime();

    // Overlap occurs if: existing start < requested end AND existing end > requested start
    return eStart < rEnd && eEnd > rStart;
}

app.post('/api/check-availability', async (req, res) => {
    const { start, end } = req.body;

    if (!start || !end) {
        return res.status(400).json({ error: 'Start and End times are required.' });
    }

    try {
        // Fetch ALL events from the database
        const response = await notionRequest(`databases/${databaseId}/query`, 'POST', {});

        if (response.object === 'error') {
            console.error('Notion API Error:', response);
            return res.status(500).json({ error: response.message });
        }

        const events = response.results || [];
        console.log(`Found ${events.length} existing events`);

        // Check each event for overlap
        let conflictFound = false;
        for (const event of events) {
            const startProp = event.properties['Start Date & Time'];
            const endProp = event.properties['End Date & Time'];

            // Get the date values
            const existingStart = startProp?.date?.start;
            const existingEnd = endProp?.date?.start; // End time is stored in 'start' field of the date property

            if (existingStart && existingEnd) {
                console.log(`Checking event: ${existingStart} to ${existingEnd}`);
                console.log(`Against requested: ${start} to ${end}`);

                if (timesOverlap(existingStart, existingEnd, start, end)) {
                    console.log('CONFLICT FOUND!');
                    conflictFound = true;
                    break;
                }
            }
        }

        res.json({ available: !conflictFound });

    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({ error: 'Failed to check availability.' });
    }
});

app.post('/api/book-event', async (req, res) => {
    const { title, start, end, type, bootcampName, specificEventType, linkedin } = req.body;

    if (!title || !start || !end || !type || !linkedin) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        const properties = {
            'Name': {
                title: [{ text: { content: title } }]
            },
            'Title of the webinar': {
                rich_text: [{ text: { content: title } }]
            },
            'Start Date & Time': {
                date: { start: start }
            },
            'End Date & Time': {
                date: { start: end }
            },
            'Type of Webinar': {
                select: { name: type }
            },
            "Guest's LinkedIn URL": {
                url: linkedin
            }
        };

        // Bootcamp Name (only for Bootcamp Webinar)
        if (bootcampName) {
            properties['Bootcamp Name (If Bootcamp)'] = {
                select: { name: bootcampName }
            };
        }

        // Specific Event Type (only for Bootcamp Webinar, not Course Webinar)
        if (type === 'Bootcamp Webinar' && specificEventType) {
            properties['Specific Event Type'] = {
                select: { name: specificEventType }
            };
        }



        const response = await notionRequest('pages', 'POST', {
            parent: { database_id: databaseId },
            properties: properties
        });

        if (response.object === 'error') {
            console.error('Notion API Error:', response);
            return res.status(500).json({ error: response.message });
        }

        res.json({ success: true, url: response.url });

    } catch (error) {
        console.error('Error booking event:', error);
        res.status(500).json({ error: 'Failed to book event.' });
    }
});

// Process Street Webhook URL
const PROCESS_STREET_WEBHOOK_URL = 'https://public-api.process.st/incoming-webhooks/enqueue/hFJdPAiP_VrwcPWMl0RGKw';

app.post('/api/trigger-process-street', async (req, res) => {
    const { title, start, end, type, bootcampName, linkedin } = req.body;

    try {
        console.log('Process Street request body:', JSON.stringify(req.body, null, 2));
        console.log('Sending to Process Street webhook...');

        // Send simple JSON to webhook
        const webhookResponse = await fetch(PROCESS_STREET_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                start: start,
                end: end,
                linkedin: linkedin,
                bootcamp: bootcampName || '',
                type: type
            })
        });

        const responseText = await webhookResponse.text();
        console.log('Webhook response status:', webhookResponse.status);
        console.log('Webhook response:', responseText);

        if (!webhookResponse.ok) {
            return res.status(500).json({
                success: false,
                error: 'Webhook request failed'
            });
        }

        // Format dates for display
        const startDate = new Date(start);
        const endDate = new Date(end);
        const dateStr = startDate.toLocaleDateString('en-IN');
        const timeStr = `${startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;

        res.json({
            success: true,
            message: 'Workflow triggered via webhook!',
            eventSummary: {
                title,
                date: dateStr,
                time: timeStr,
                type,
                bootcamp: bootcampName || 'N/A',
                linkedin
            }
        });

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
