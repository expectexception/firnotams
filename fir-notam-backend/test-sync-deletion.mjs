import mongoose from 'mongoose';
import { NotamCacheModel } from './src/models/NotamCache.js';
import { fetchBulkNotams } from './src/notamService.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function testSyncDeletion() {
    console.log('--- Sync Deletion Verification ---');

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const testIcao = 'ZZZZ'; // Use a dummy ICAO or one that is unlikely to have real data but still "completes"

        // 1. Clear existing data for testIcao
        await NotamCacheModel.deleteOne({ icao: testIcao });

        // 2. Insert a dummy "stale" NOTAM
        const staleNotam = {
            id: 'STALE-123',
            text: 'A) ZZZZ B) 2401010000 C) 2501010000 E) STALE TEST NOTAM',
            status: 'green',
            hasEscat: false,
            analysis: {
                notamId: 'STALE-123',
                isActive: true,
                isPermanent: false,
                startsAtUtc: '2024-01-01T00:00:00Z',
                endsAtUtc: '2025-01-01T00:00:00Z',
                confidence: 'high'
            }
        };

        await NotamCacheModel.create({
            icao: testIcao,
            notams: [staleNotam],
            status: 'green',
            hasEscat: false,
            cachedAt: Date.now(),
            lastCheckedAt: Date.now(),
            lastSuccessfulUpdate: Date.now()
        });
        console.log(`✅ Seeded ${testIcao} with 1 stale NOTAM`);

        // 3. Run fetchBulkNotams with forceRefresh
        // Note: For ZZZZ, the scraper might return 0 results and isComplete: true
        console.log(`Running fetchBulkNotams for ${testIcao}...`);
        // We need to wait for the background scrape to finish or run it in-process if we can.
        // fetchBulkNotams normally returns immediately and runs scrape in background.
        // Let's modify the test to wait or mock if necessary.

        // Since we are in the same process, we can't easily wait for the background task
        // unless we export the runner or wait for a change in DB.

        const initialDoc = await NotamCacheModel.findOne({ icao: testIcao });
        console.log(`Initial NOTAM count: ${initialDoc.notams.length}`);

        // We'll call fetchBulkNotams. Since it triggers background, we'll poll the DB.
        await fetchBulkNotams([testIcao], { forceRefresh: true });

        console.log('Waiting for background sync (15s)...');
        let deleted = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const doc = await NotamCacheModel.findOne({ icao: testIcao }).lean();
            if (doc && doc.notams.length === 0) {
                console.log(`✅ Success: Stale NOTAM was removed for ${testIcao} after ${i + 1}s`);
                deleted = true;
                break;
            }
            if (doc && doc.lastCheckedAt > initialDoc.lastCheckedAt) {
                // Scrape finished but NOTAM still there?
                if (doc.notams.length > 0) {
                    console.log(`ℹ️ Scrape finished but NOTAM still there. count: ${doc.notams.length}`);
                    // Check if isComplete was true in the last update
                    // We don't store isComplete in DB in this version?
                    // Let's check the code.
                }
            }
        }

        if (!deleted) {
            console.log('❌ Failure: Stale NOTAM was NOT removed.');
            const finalDoc = await NotamCacheModel.findOne({ icao: testIcao }).lean();
            console.log('Final NOTAMs:', finalDoc?.notams);
        }

        mongoose.connection.close();
        process.exit(deleted ? 0 : 1);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

testSyncDeletion();
