const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const port = 3000;

let browser, page;

// Initialize Puppeteer and start server
(async () => {
  try {
    browser = await puppeteer.launch({ headless: true }); // Launch Puppeteer in non-headless mode for visibility (change to true for headless)
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('https://chatgpt.com/'); // Replace with your actual ChatGPT URL

    // Define static files directory and Pug as the view engine
    app.use(express.static('public'));
    app.set('view engine', 'pug');
    app.set('views', __dirname + '/views');

    // Routes
    app.get('/', (req, res) => {
      res.render('index');
    });

    // Endpoint to interact with ChatGPT and send response
    app.get('/chat', async (req, res) => {
      try {
        const prompt = req.query.prompt;

        // Wait for the textarea element to be available
        await page.waitForSelector('textarea[placeholder="Message ChatGPT"]', { visible: true });
        await page.type('textarea[placeholder="Message ChatGPT"]', prompt);

        // Simulate Enter key press in the textarea
        await page.keyboard.press('Enter');

        // Introduce a delay to ensure response is fully loaded (12 seconds)
        await new Promise(resolve => setTimeout(resolve, 12000));

        // Get the entire page content as HTML
        const pageContent = await page.content();

        // Extract text from <p> tags and filter out sensitive information
        const pTagTexts = extractTextFromPTags(pageContent);

        // Send the filtered <p> tag texts back to the client
        res.send(pTagTexts.join('\n'));
      } catch (error) {
        console.error('Error during page interaction:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    // Start the Express server
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (error) {
    console.error('Error launching browser:', error);
  }
})();

// Function to extract text from <p> tags in the provided HTML
function extractTextFromPTags(html) {
  const regex = /<p.*?>(.*?)<\/p>/gis;
  let match;
  const texts = [];
  while ((match = regex.exec(html)) !== null) {
    const text = match[1].trim();
    // Check if the text contains the filter phrase (case insensitive)
    if (!text.toLowerCase().includes("chatgpt can make mistakes. check important info.")) {
      texts.push(text);
    }
  }
  return texts;
}
