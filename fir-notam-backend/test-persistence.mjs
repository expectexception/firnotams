import mongoose from 'mongoose';
import { NotamCacheModel } from './src/models/NotamCache.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function verifyPersistence() {
    console.log('--- Persistence Verification ---');

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const testIcao = 'OMAA';

        // 1. Check if OMAA exists
        const doc = await NotamCacheModel.findOne({ icao: testIcao }).lean();
        if (!doc) {
            console.log(`❌ No data found for ${testIcao}. Run a scrape first.`);
            process.exit(1);
        }

        console.log(`Found ${testIcao} document.`);
        console.log(`- NOTAM Count: ${doc.notams.length}`);
        console.log(`- Status: ${doc.status}`);
        console.log(`- Last Successful Update: ${new Date(doc.lastSuccessfulUpdate).toISOString()}`);
        console.log(`- Last Checked At: ${new Date(doc.lastCheckedAt).toISOString()}`);

        const initialUpdate = doc.lastSuccessfulUpdate;
        const initialChecked = doc.lastCheckedAt;

        console.log('\nWaiting 2 seconds before re-fetching...');
        await new Promise(r => setTimeout(r, 2000));

        // 2. Trigger a fetch via API (ensure it hits the background refresh logic)
        console.log('Triggering API fetch...');
        const fetch = (await import('node-fetch')).default;
        await fetch(`http://localhost:3001/api/notams/bulk?locations=${testIcao}&forceRefresh=true`);

        // Wait a bit for background scrape to finish if it was triggered
        console.log('Waiting for potential background update (5s)...');
        await new Promise(r => setTimeout(r, 5000));

        // 3. Check again
        const doc2 = await NotamCacheModel.findOne({ icao: testIcao }).lean();
        console.log('\nUpdated Document State:');
        console.log(`- Last Checked At improved: ${doc2.lastCheckedAt > initialChecked}`);

        if (doc2.lastSuccessfulUpdate > initialUpdate) {
            console.log('✅ lastSuccessfulUpdate WAS updated (Data likely changed or it was the first scrape in this session).');
        } else {
            console.log('ℹ️ lastSuccessfulUpdate unchanged (Data was identical).');
        }

        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

verifyPersistence();
