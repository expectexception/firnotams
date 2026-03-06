import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';

const NotamItemSchema = new mongoose.Schema({
    id: String,
    text: String,
    status: String,
}, { _id: false });

const LocationNotamsSchema = new mongoose.Schema({
    icao: String,
    notams: [NotamItemSchema],
    status: String,
});

const NotamCache = mongoose.model('NotamCache', LocationNotamsSchema);

async function search() {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');

        const results = await NotamCache.find({
            'notams.text': { $regex: /JAMMING|SPOOFING|JAM|GNSS|GPS/i }
        });

        console.log(`Found ${results.length} locations with related NOTAMs.\n`);

        results.forEach((loc: any) => {
            const relevantNotams = loc.notams.filter((n: any) =>
                /JAMMING|SPOOFING|JAM|GNSS|GPS/i.test(n.text)
            );

            if (relevantNotams.length > 0) {
                console.log(`=== REGION: ${loc.icao} ===`);
                relevantNotams.forEach((n: any) => {
                    console.log(`ID: ${n.id}`);
                    console.log(`TEXT: ${n.text}`);
                    console.log('-------------------');
                });
                console.log('\n');
            }
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

search();
