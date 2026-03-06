import mongoose from 'mongoose';
import { NotamCacheModel } from './src/models/NotamCache';
import { fetchBulkNotams } from './src/notamService';
import * as dotenv from 'dotenv';
dotenv.config();
process.env.FETCH_AIRPORTS_ENABLED = 'true';
process.env.USE_AUTOROUTER_API_DATA = 'true';

async function testSyncDeletion() {
    console.log('--- Sync Deletion Verification (TS) ---');

    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('✅ Connected to MongoDB');

        const testIcao = 'ZZZZ';

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
                isEstimated: false,
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

        const initialDoc = await NotamCacheModel.findOne({ icao: testIcao });
        console.log(`Initial NOTAM count: ${initialDoc?.notams.length}`);

        // 3. Run fetchBulkNotams with forceRefresh
        console.log(`Running fetchBulkNotams for ${testIcao}...`);
        await fetchBulkNotams([testIcao], { forceRefresh: true });

        console.log('Waiting for background sync (20s)...');
        let deleted = false;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const doc = await NotamCacheModel.findOne({ icao: testIcao }).lean();
            if (doc && doc.notams.length === 0 && (doc.lastCheckedAt ?? 0) > (initialDoc?.lastCheckedAt ?? 0)) {
                console.log(`✅ Success: Stale NOTAM was removed for ${testIcao} after ${i + 1}s`);
                deleted = true;
                break;
            }
            if (i % 10 === 0) console.log(`Polling... attempts: ${i}`);
        }

        if (!deleted) {
            console.log('❌ Failure: Stale NOTAM was NOT removed.');
            const finalDoc = await NotamCacheModel.findOne({ icao: testIcao }).lean();
            console.log('Final NOTAMs count:', finalDoc?.notams.length);
            console.log('Last Checked At updated:', (finalDoc?.lastCheckedAt ?? 0) > (initialDoc?.lastCheckedAt ?? 0));
        }

        await mongoose.connection.close();
        process.exit(deleted ? 0 : 1);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

testSyncDeletion();
