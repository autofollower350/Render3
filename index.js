const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// --- ग्लोबल ब्राउज़र वेरिएबल (ताकि बार-बार ब्राउज़र न खोलना पड़े) ---
let browser;

async function initBrowser() {
    browser = await chromium.launch({ 
        headless: true, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-first-run'
        ] 
    });
    console.log("🚀 Global Browser Initialized and Ready!");
}

// सर्वर शुरू होते ही ब्राउज़र बैकग्राउंड में चालू हो जाएगा
initBrowser();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- PDF Extract Logic (Same as yours) ---
async function extractStudentInfo(pdfPath) {
    const info = { name: "Not Found", father: "Not Found", roll: "Not Found", center: "Not Found" };
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdfParse(dataBuffer);
        const text = data.text;

        const rollMatch = text.match(/Roll no is\s+([\w\d]+)/);
        if (rollMatch) info.roll = rollMatch[1].trim();

        const nameMatch = text.match(/NAME OF CANDIDATE\s*:\s*(.*)/);
        if (nameMatch) info.name = nameMatch[1].split('\n')[0].trim();

        const fatherMatch = text.match(/FATHER'S NAME\s*:\s*(.*)/);
        if (fatherMatch) info.father = fatherMatch[1].split('\n')[0].trim();

        const centerPattern = /Exam Centre is\s*([\s\S]*?)(?=Print Date|To,|The Centre|NAME OF EXAMINATION)/;
        const centerMatch = text.match(centerPattern);
        if (centerMatch) {
            info.center = centerMatch[1].replace(/\s+/g, ' ').trim();
        } else {
            const altMatch = text.match(/CENTER OF EXAMINATION\s*:\s*([\s\S]*?)(?=\nSR NO|\nPrint Date)/);
            if (altMatch) info.center = altMatch[1].replace(/\s+/g, ' ').trim();
        }
        return info;
    } catch (error) {
        console.error(`Extraction Error: ${error.message}`);
        return info;
    }
}

// --- Fast Download Route ---
app.post('/download', async (req, res) => {
    const formNo = req.body.form_no;
    if (!formNo || !/^\d+$/.test(formNo)) {
        return res.send("<h3>❌ Error: Invalid Form Number!</h3><a href='/'>Wapas Jao</a>");
    }

    const pdfPath = path.join(__dirname, `admit_card_${formNo}.pdf`);
    let context;
    let page;

    try {
        // अगर किसी वजह से ब्राउज़र क्रैश हो गया हो तो दोबारा चालू करें
        if (!browser) await initBrowser();

        // ब्राउज़र खोलने का टाइम बच गया, सीधा नया कॉन्टेक्स्ट और पेज खोलें
        context = await browser.newContext({ acceptDownloads: true });
        page = await context.newPage();

        // ⚡ सुपर फास्ट ब्लॉकिंग: इमेज, सीएसएस, फॉन्ट और फालतू ट्रैकर स्क्रिप्ट्स सब ब्लॉक
        await page.route('**/*', (route) => {
            const requestType = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media', 'script'].includes(requestType)) {
                return route.abort();
            }
            route.continue();
        });

        const url = "https://erp.jnvuiums.in/(S(biolzjtwlrcfmzwwzgs5uj5n))/Exam/Pre_Exam/Exam_ForALL_AdmitCard.aspx#";
        
        // 'domcontentloaded' सबसे तेज़ होता है, यह पूरी वेबसाइट लोड होने का इंतज़ार नहीं करता
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // बिना देरी किए फॉर्म भरना
        await page.fill("#txtchallanNo", String(formNo), { force: true });
        
        const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
        
        // ⚡ तेजी से क्लिक करना (बिना आधा सेकंड वेस्ट किए)
        await page.click("#btnGetResult", { noWaitAfter: true }); 

        const download = await downloadPromise;
        await download.saveAs(pdfPath);
        
        // सिर्फ पेज और कॉन्टेक्स्ट बंद करें, ब्राउज़र चालू रहेगा
        await page.close();
        await context.close();

        if (fs.existsSync(pdfPath)) {
            const studentData = await extractStudentInfo(pdfPath);
            console.log(`\n✅ Downloaded: ${studentData.name} | Roll: ${studentData.roll}\n`);

            res.download(pdfPath, `JNVU_${formNo}.pdf`, () => {
                if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); 
            });
        } else {
            res.send("<h3>❌ Error: Admit Card file nahi mili.</h3><a href='/'>Wapas Try Karein</a>");
        }

    } catch (error) {
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        res.send(`<h3>❌ Error: Admit Card nahi mila ya JNVU site down hai.</h3><p>${error.message}</p><a href='/'>Wapas Try Karein</a>`);
    }
});

app.listen(port, () => {
    console.log(`Web Server running on port ${port}`);
});
