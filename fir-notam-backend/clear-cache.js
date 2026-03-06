const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables just in case

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fir-notam');
        const db = mongoose.connection.db;
        const result = await db.collection('notamcaches').deleteMany({});
        console.log(`Cache cleared. Deleted ${result.deletedCount} documents.`);
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
run();
