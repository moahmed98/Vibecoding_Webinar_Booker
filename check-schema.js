require('dotenv').config();

// Use fetch directly to query Notion API
const databaseId = process.env.NOTION_DATABASE_ID;
const apiKey = process.env.NOTION_API_KEY;

async function getEntries() {
    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ page_size: 1 })
        });

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const entry = data.results[0];
            console.log('--- Property Names & Types ---');
            for (const [name, prop] of Object.entries(entry.properties)) {
                console.log(`"${name}" -> Type: ${prop.type}`);
            }
            console.log('\n--- Full Properties ---');
            console.log(JSON.stringify(entry.properties, null, 2));
        } else {
            console.log('No entries found. Response:', JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

getEntries();
