import puppeteer from 'puppeteer';

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--window-size=1920,1080',
        ]
    });
    const page = await browser.newPage();
    
    await page.setCookie({
        name: 'fnsDisclaimer', value: 'agreed',
        domain: 'notams.aim.faa.gov', path: '/',
    });

    const dataP = new Promise(resolve => {
        page.on('response', async res => {
            if (res.url().includes('/notamSearch/search') && res.request().method() === 'POST') {
                if ((res.headers()['content-type'] || '').includes('json')) {
                    try {
                        const d = await res.json();
                        resolve(d);
                    } catch {}
                }
            }
        });
    });

    console.log("Navigating...");
    await page.goto('https://notams.aim.faa.gov/notamSearch/nsapp.html#/', {waitUntil: 'networkidle2'});
    
    console.log("Waiting for input...");
    await page.waitForSelector('input[name="designatorsForLocation"]');
    await page.type('input[name="designatorsForLocation"]', 'OMAA,OMDB');
    
    console.log("Submitting...");
    await page.evaluate(() => {
        document.querySelector('button.btn-primary').click();
    });

    console.log("Waiting for response...");
    const data = await dataP;
    if (data && data.notamList && data.notamList.length > 0) {
        console.log("Keys of first NOTAM:");
        console.log(Object.keys(data.notamList[0]));
        console.log("Sample NOTAM:");
        const n = data.notamList[0];
        console.log(JSON.stringify({
            facilityDesignator: n.facilityDesignator,
            location: n.location,
            issueDate: n.issueDate,
            notamNumber: n.notamNumber
        }, null, 2));
    } else {
        console.log("No NOTAMs or different structure.");
    }
    await browser.close();
}
run().catch(console.error);

