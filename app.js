// Import required modules
import Express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import session from 'express-session';

// Initialize Express app
const app = Express();
const port = 2400;
app.set('view engine', 'pug');
app.use(Express.json());
app.use(Express.static('public'));

// Use body-parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Load environment variables from .env file
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_key });

// Use express-session middleware to manage sessions
app.use(session({
    secret: process.env.Session, // Change this to a long, random string
    resave: false,
    saveUninitialized: true
}));


// Mongo db History Nigga 

import { MongoClient } from 'mongodb';

// Connection URL
const url = process.env.MONGO_URI;

// Database Name
const dbName = 'test';

async function connectToMongoDB() {
    // Create a new MongoClient
    const client = new MongoClient(url);

    try {
        // Connect the client to the server
        await client.connect();

        console.log('Connected to MongoDB server');

        // Get the database
        const db = client.db(dbName);

        // Return the database object
        return { db, client };
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error;
    }
}

// Function to save chat messages to MongoDB
async function saveChatToMongoDB(chat) {
    let client;
    try {
        // Connect to MongoDB
        const { db, client: connectedClient } = await connectToMongoDB();
        client = connectedClient;

        // Get the collection
        const collection = db.collection('openai');

        // Insert the chat message into the collection
        const result = await collection.insertOne(chat);

        console.log('Chat saved to MongoDB:', result.insertedId);
    } catch (error) {
        console.error('Error saving chat to MongoDB:', error);
        throw error;
    } finally {
        // Disconnect the client
        if (client) {
            await client.close();
            console.log('MongoDB client disconnected');
        }
    }
}

// Serve static files
app.use(Express.static('public'));


app.get('/', (req, res) => {
    res.render('index')
});

app.post('/isauthenticated', (req, res) => {
    const userval = req.body.userval;
    if (userval === process.env.SecretKey) {
        // Check if user already accessed 'gpt' page
        if (!req.session.gptAccessed) {
            // Set authenticated session variable
            req.session.authenticated = true;
            // Set flag indicating 'gpt' page is accessed
            req.session.gptAccessed = true;
            res.render('gpt');
        } else {
            // If 'gpt' page is already accessed, redirect to '/'
            res.redirect('/');
        }
    } else {
        res.redirect('/');
    }
});



// Handle POST request for chat messages

app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;

    try {
        // Send user message to OpenAI for processing
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: userMessage }],
            model: "gpt-3.5-turbo",
        });

        // Extract GPT AI response from completion
        const gptResponse = completion.choices[0].message.content;

        // Send GPT AI response back to client
        res.json({ message: gptResponse });
        const chat = {
            date: new Date(),
            user: req.body.message,
            gpt: completion.choices[0].message.content
        };
        // Save the chat to MongoDB
        await saveChatToMongoDB(chat);
    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).json({ error: 'An error occurred while processing the message' });
    }
});



// Start the server
app.listen(port, () => {
    console.log(`Server is running @http://localhost:${port}/`);
});