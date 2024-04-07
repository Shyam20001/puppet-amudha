// Import required modules
import Express from 'express';
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet';
import OpenAI from 'openai';
import axios from 'axios';
import { createTerminus } from '@godaddy/terminus';

//import bcrypt from 'bcrypt'
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import session from 'express-session';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
//import helmet from 'helmet';
//import { SMTPClient } from 'emailjs';
import nodemailer from 'nodemailer';

// Load environment variables from .env file
dotenv.config();

let hashedSecretKey; // Variable to store the hashed secret key

// Hash the SecretKey once when the application starts
// (async () => {
//     try {
//         hashedSecretKey = await bcrypt.hash(process.env.SecretKey, 10);
//         console.log('SecretKey hashed successfully:', hashedSecretKey);
//     } catch (error) {
//         console.error('Error hashing SecretKey:', error);
//         process.exit(1); // Exit the application if hashing fails
//     }
// })();

//Server (CLOUD_PROVIDER_NAME)
const provider = process.env.CLOUD_PROVIDER_NAME

//Gemini Credentials

const MODEL_NAME = "gemini-1.0-pro";
const API_KEY = process.env.GEMINI_key;

// Claude Credentials
const apiKey = process.env.CLAUDEAI_key
const apiUrl = 'https://api.anthropic.com/v1/complete';


// Create a Nodemailer transporter using Gmail's SMTP server
// Create a Nodemailer transporter using Gmail's SMTP server
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.Gmail,
        pass: process.env.GPWD
    }
});

// Define the function to trigger an email
function triggerMail(ip = 'Sent Already', device = 'Sent Already', location = 'Tracked', duration, pwd = 'Not Tried') {
    // Email content
    const mailOptions = {
        from: process.env.Gmail,
        to: process.env.Rceiv, // Your email address where you want to receive notifications
        subject: `Third-party access to your site @${provider}`,
        text: `A third-party user accessed your site from ${ip} using ${device} (${location}) with pwd ${pwd} total-duration ${duration}.`
    };

    // Send email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}

// Now you can call this function wherever you want to trigger the email


// Initialize Express app
const app = Express();
const port = process.env.PORT
const host = process.env.HOST
// Use Helmet.js middleware
//app.use(helmet());
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://code.jquery.com"],
                //connectSrc: ["'self'", 'api.anthropic.com'], // Allow connections to the Claude AI API
                // Add other necessary directives based on your requirements
            },
        },
    })
);

// Rate Limiter

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    // store: ... , // Redis, Memcached, etc. See below.
})

// Apply the rate limiting middleware to all requests.
app.use(limiter)


app.set('view engine', 'pug');
app.use(Express.json());
app.use(Express.static('public'));


// Use body-parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


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
// async function saveChatToMongoDB(chat) {
//     let client;
//     try {
//         // Connect to MongoDB
//         const { db, client: connectedClient } = await connectToMongoDB();
//         client = connectedClient;

//         // Get the collection
//         const collection = db.collection('openai');

//         // Insert the chat message into the collection
//         const result = await collection.insertOne(chat);

//         console.log('Chat saved to MongoDB:', result.insertedId);
//     } catch (error) {
//         console.error('Error saving chat to MongoDB:', error);
//         throw error;
//     } finally {
//         // Disconnect the client
//         if (client) {
//             await client.close();
//             console.log('MongoDB client disconnected');
//         }
//     }
// }

async function saveChatToMongoDB(chatData, collectionName) {
    let client;
    try {
        // Connect to MongoDB
        const { db, client: connectedClient } = await connectToMongoDB();
        client = connectedClient;

        // Get the collection based on collectionName
        const collection = db.collection(collectionName);

        // Insert the chat data into the collection
        const result = await collection.insertOne(chatData);

        console.log(`Chat saved to MongoDB collection ${collectionName}:`, result.insertedId);
    } catch (error) {
        console.error(`Error saving chat to MongoDB collection ${collectionName}:`, error);
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

// Function to calculate duration in seconds
function calculateDuration(startTime) {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // Convert milliseconds to seconds
    return duration;
}
// Middleware to extract user information
app.use((req, res, next) => {
    req.userData = {
        ip: req.ip, // User's IP address
        device: req.headers['user-agent'], // User's device information
        location: req.headers['x-forwarded-for'] || req.connection.remoteAddress, // User's location
        startTime: new Date() // Start time of access
    };
    next();
});

// Logs on CLI

app.use((req, res, next) => {
    console.log(`${new Date()} *** ${req.method} ${req.url}`)
    next()
})

// GET

app.get('/', (req, res) => {

    // Call the triggerMail() function to send an email with the gathered information
    triggerMail(req.userData.ip, req.userData.device, req.userData.location, calculateDuration(req.userData.startTime));
    res.render('index')
});

// app.post('/isauthenticated', (req, res) => {
//     const userval = req.body.userval;
//     const pwd = userval; // Assuming you're using this password for authentication

//     // Call the triggerMail() function to send an email with the gathered information
//     triggerMail(req.userData.ip, req.userData.device, req.userData.location, calculateDuration(req.userData.startTime), pwd);
//     if (userval === process.env.SecretKey) {
//         // Check if user already accessed 'gpt' page
//         if (!req.session.gptAccessed) {
//             // Set authenticated session variable
//             req.session.authenticated = true;
//             // Set flag indicating 'gpt' page is accessed
//             req.session.gptAccessed = true;
//             res.render('gpt');
//         } else {
//             // If 'gpt' page is already accessed, redirect to '/'
//             res.redirect('/');
//         }
//     } else {
//         res.redirect('/');
//     }
// });



// Handle POST request for chat messages

/**NEW USER LOGIN PORTAL */
// app.post('/isauthenticated', (req, res) => {
//     // Get the value of SecretKey from the environment variable
//     const secretKey = process.env.SecretKey;

//     // Split the value into individual passwords
//     const passwords = secretKey.split(",");

//     const userval = req.body.userval;

//     // Call the triggerMail() function to send an email with the gathered information
//     triggerMail(req.userData.ip, req.userData.device, req.userData.location, calculateDuration(req.userData.startTime), userval);

//     // Check if the entered password matches any of the passwords
//     if (passwords.includes(userval)) {
//         // Check if user already accessed 'gpt' page
//         if (!req.session.gptAccessed) {
//             // Set authenticated session variable
//             req.session.authenticated = true;
//             // Set flag indicating 'gpt' page is accessed
//             req.session.gptAccessed = true;
//             res.render('gpt');
//         } else {
//             // If 'gpt' page is already accessed, redirect to '/'
//             res.redirect('/');
//         }
//     } else {
//         // If the entered password is not valid, redirect to '/'
//         res.redirect('/');
//     }
// });



// Middleware function to check if the user is authenticated

// Function to Check session and Enigma id present or not.
function checkAuthentication(req, res, next) {
    const userval2 = req.session.password;

    // Check if the user is authenticated
    if (!userval2) {
        return res.json({ message: "Your session has expired. Please refresh the page and log in again ⏳" });
    }

    // User is authenticated, proceed to the next middleware or route handler
    next();
}


/**SUPER-MASTER ADMIN ROUTE implementation */
app.post('/isauthenticated', (req, res) => {
    // Get the value of SecretKey and SuperAdminMasterKey from the environment variables
    const secretKey = process.env.SecretKey;
    const superAdminMasterKey = process.env.superAdminMasterKey;

    // Split the value into individual passwords
    const passwords = secretKey.split(",");
    const superAdminKeys = superAdminMasterKey.split(",");

    const userval = req.body.userval;

    // Store the entered password in the session
    req.session.password = userval;

    // Call the triggerMail() function to send an email with the gathered information
    triggerMail(req.userData.ip, req.userData.device, req.userData.location, calculateDuration(req.userData.startTime), userval);

    // Check if the entered password matches any of the passwords
    if (passwords.includes(userval)) {
        // Check if user already accessed 'gpt' page
        if (!req.session.gptAccessed) {
            // Set authenticated session variable
            req.session.authenticated = true;
            // Set flag indicating 'gpt' page is accessed
            req.session.gptAccessed = true;

            // Check if the user is a super admin
            if (superAdminKeys.includes(userval)) {
                // Set flag indicating the user is a super admin
                req.session.superAdmin = true;
            }

            res.render('gpt');
        } else {
            // If 'gpt' page is already accessed, redirect to '/'
            res.redirect('/');
        }
    } else {
        // If the entered password is not valid, redirect to '/'
        res.redirect('/');
    }
});

// Middleware to check if user is a super admin before accessing certain routes
const checkSuperAdmin = (req, res, next) => {
    if (req.session.superAdmin) {
        next();
    } else {
        res.json({ message: `You are not a Super-Admin sorry! Toggle Route to Send(Chat2) ⚠️` });
    }
};



app.post('/chat', checkAuthentication, checkSuperAdmin, async (req, res) => {
    const userMessage = req.body.message;

    try {
        // Send user message to OpenAI for processing
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: userMessage }],
            model: "gpt-3.5-turbo",
        });

        // Extract GPT AI response from completion
        const gptResponse = completion.choices[0].message.content;

        // Encrypt or hash the SecretKey
        //const encryptedUserId = hashedSecretKey; //////////////////

        // Get the password used by the user from the session
        const userval2 = req.session.password;

        // Send GPT AI response back to client
        res.json({ message: gptResponse });

        // Prepare chat object for MongoDB
        const chat = {
            date: new Date(),
            user: userMessage,
            gpt: gptResponse,
            EnigmaID: userval2  // Add encrypted userid to chat object
        };

        // Save the chat to MongoDB
        await saveChatToMongoDB(chat, 'openai');
        // console.log('Chat saved to MongoDB collection openai:', chat);
    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).json({ error: 'An error occurred while processing the message' });
    }
});


// Gemini Ai

app.post('/chat2', checkAuthentication, async (req, res) => {
    const { message } = req.body;
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
        temperature: 0.9,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
    };

    const safetySettings = [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
    ];

    try {
        const chat = model.startChat({
            generationConfig,
            safetySettings,
            history: [],
        });

        const result = await chat.sendMessage(message);
        const geminiResponse = result.response.text();

        // Encrypt or hash the SecretKey
        // const encryptedUserId = hashedSecretKey;

        // Get the password used by the user from the session
        const userval2 = req.session.password;

        // Save relevant information to MongoDB
        const chatData = {
            userMessage: message,
            geminiResponse: geminiResponse,
            date: new Date(), // Current date and time
            EnigmaID: userval2
        };

        // Save Gemini response in 'gemini' collection
        await saveChatToMongoDB(chatData, 'gemini');
        res.json({ message: geminiResponse });
    } catch (error) {
        console.error('Error processing message with Gemini AI:', error);
        res.status(500).json({ error: 'An error occurred while processing the message with Gemini AI' });
    }
});

// Claude Route

async function generateText(prompt) {
    try {
        const response = await axios.post(apiUrl, {
            prompt: `\n\nHuman: ${prompt}\n\nAssistant:`, // Add "\n\nAssistant:" at the end of the prompt
            model: 'claude-v1',
            max_tokens_to_sample: 500,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
                'anthropic-version': '2023-06-01',
            },
        });

        const generatedText = response.data.completion;
        return generatedText;
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response && error.response.data) {
            console.error('Error Details:', error.response.data);
        }
        throw error;
    }
}


app.post('/chat3', checkAuthentication, checkSuperAdmin, async (req, res) => {
    const { message } = req.body;

    try {
        const responseText = await generateText(message);

        // Encrypt or hash the SecretKey
        //const encryptedUserId = process.env.SecretKey;   /////////

        // Get the password used by the user from the session
        const userval2 = req.session.password;

        // Save relevant information to MongoDB
        const chatData = {
            userMessage: message,
            claudeResponse: responseText,
            date: new Date(), // Current date and time
            EnigmaID: userval2
        };

        // Save Claude AI response in 'claudeai' collection
        await saveChatToMongoDB(chatData, 'claudeai');

        res.json({ message: responseText });
    } catch (error) {
        console.error('Error processing message with Claude AI:', error);
        res.status(500).json({ error: 'An error occurred while processing the message with Claude AI' });
    }
});





const serverStartTime = Date.now(); // Get the current timestamp in milliseconds
const serverCreatedBy = 'Shyam. M Node.js Architect @2024March20';

const formatUptime = (uptime) => {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    return `${days} days, ${hours % 24} hours, ${minutes % 60} minutes, ${seconds % 60} seconds`;
};


const healthCheck = () => {
    return new Promise((resolve, reject) => {
        // Check server lifecycle
        const serverUptime = Date.now() - serverStartTime;

        // Additional health checks can be performed here

        // Resolve if all checks pass
        resolve({
            serverUptime,
            serverCreatedBy
        });
    });
};


const terminusHealthCheck = async () => {
    const result_1 = await healthCheck();
    // Format server uptime
    result_1.serverUptime = formatUptime(result_1.serverUptime);
    return result_1;
};




// SPIN UP THE BEAST 🔥
const server = app.listen(port, () => {
    console.log(`Server is running @ http://localhost:${port}/  pid-${process.pid}  ppid-${process.ppid}`);
});



const onSignal = async () => {
    console.log('Received kill signal, shutting down gracefully');

    // Prevent new requests from being accepted
    server.close((err) => {
        if (err) {
            console.error('Error closing server:', err);
            process.exit(1);
        }
        console.log('Closed out remaining connections');
        console.log('Server shut down gracefully');
        process.exit(0);
    });


    // Forcefully shut down server after 30 seconds
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 30000); // 30 seconds
};





createTerminus(server, {
    signals: ['SIGTERM', 'SIGINT'],
    healthChecks: {
        '/health': terminusHealthCheck
    },
    onSignal
});
