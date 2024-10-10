const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 3001;  // Fallback port
const FOLLOW_UP_TIME_LIMIT = 5 * 1000; // 10 seconds time limit for follow-up emails

// Middleware
app.use(cors());
app.use(express.json());  // Use express.json() for JSON requests

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB connection error:', err));

// Updated email schema with 'isComingSoon' field
const emailSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    isComingSoon: { type: Boolean, default: true }  // Initially set to true
});

const Subscriber = mongoose.model('Subscriber', emailSchema);

// Nodemailer setup
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Gmail SMTP server
    port: 587, // Gmail SMTP port
    secure: false, // Use TLS
    auth: {
        user: process.env.EMAIL, // Your email address
        pass: process.env.EMAIL_PASS // Your app password
    }
});

// API route for subscribing
app.post('/api/subscribe', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        // Save email to database with isComingSoon = true by default
        const newSubscriber = new Subscriber({ email });
        await newSubscriber.save();

        // Send confirmation email
        const mailOptions = {
            from: `StyleHub <${process.env.EMAIL}>`,
            to: email,
            subject: 'Subscription Confirmation',
            text: `Thank you for subscribing to our online store! We are delighted to have you as a valued member of our community.

            As a token of our appreciation, you will receive a $15 credit toward your next purchase. We invite you to explore our range of products and enjoy this special offer.
            
            If you have any questions or need further assistance, please don't hesitate to reach out.
            
            Welcome aboard!
            
            Best regards,
            StyleHub Team`
        };

        // Sending the email
        await transporter.sendMail(mailOptions);
        console.log('Confirmation email sent:', mailOptions.to);

        // Trigger follow-up email after a delay of 10 seconds
        setTimeout(() => {
            sendLiveNotificationEmails(newSubscriber.email);
        }, FOLLOW_UP_TIME_LIMIT);

        return res.status(200).json({ message: 'Subscription successful, confirmation email sent.' });

    } catch (error) {
        if (error.code === 11000) {  // Duplicate key error (email already exists)
            return res.status(400).json({ error: 'This email is already subscribed.' });
        }
        console.error('Error during subscription:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Function to send the "Website Live" email
const sendLiveNotificationEmails = async (startTime) => {
    try {
        const subscribers = await Subscriber.find({ isComingSoon: true });

        const currentTime = Date.now();
        const timeElapsed = currentTime - startTime;

        if (timeElapsed > FOLLOW_UP_TIME_LIMIT) {
            console.log(`Time limit exceeded. Skipping follow-up emails.`);
            return;
        }

        for (const subscriber of subscribers) {
            // Check if the follow-up email has already been sent
            if (!subscriber.followUpEmailSent) {
                const followUpMailOptions = {
                    from: `StyleHub <${process.env.EMAIL}>`,
                    to: subscriber.email,
                    subject: 'Important Update: Website is Now Live!',
                    text: `Dear User,

I hope this message finds you well.

I am excited to announce that our new website is now live! We appreciate your support and patience during our transition to this improved platform. As a token of our gratitude, we are offering a $15 credit toward your next purchase. 

Please visit our website to explore our latest products and take advantage of this exclusive offer. Should you have any questions or need assistance, feel free to reach out to our customer support team at [support email or phone number].

Thank you for being a valued subscriber, and we look forward to serving you better through our new online store.

Best regards,
StyleHub Team`
                };

                // Send the follow-up email
                await transporter.sendMail(followUpMailOptions);
                console.log(`Follow-up email sent to: ${subscriber.email}`);

                // Update the subscriber's 'isComingSoon' status to false and set followUpEmailSent to true
                await Subscriber.findOneAndUpdate(
                    { email: subscriber.email },
                    { isComingSoon: false, followUpEmailSent: true }
                );
            }
        }

        console.log('All follow-up emails sent.');

    } catch (error) {
        console.error('Error while sending follow-up emails:', error);
    }
};

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.message);
    if (!err.statusCode) err.statusCode = 500;
    res.status(err.statusCode).send(err.message);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// API route to check if the site is live
app.get('/api/site-status', async (req, res) => {
    try {
        // Check if any subscribers have isComingSoon set to false
        const liveSubscribers = await Subscriber.find({ isComingSoon: false });
        
        // If any subscribers have isComingSoon: false, the site is live
        const siteLive = liveSubscribers.length > 0;

        res.status(200).json({ siteLive });
    } catch (error) {
        console.error('Error fetching site status:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/unsubscribe', async (req, res) => {
    const { email } = req.body;

    try {
        // Remove user from the database
        const result = await User.deleteOne({ email });

        if (result.deletedCount > 0) {
            return res.json({ success: true });
        } else {
            return res.status(404).json({ error: 'User not found.' });
        }
    } catch (error) {
        console.error('Error unsubscribing:', error);
        return res.status(500).json({ error: 'An error occurred while unsubscribing.' });
    }
});

// API route to check if the email has access
app.post('/api/check-access', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const subscriber = await Subscriber.findOne({ email });
        const siteLive = await Subscriber.find({ isComingSoon: false }).countDocuments() > 0;

        if (subscriber) {
            // Check if the subscriber has access
            const hasAccess = subscriber.isComingSoon === false;
            return res.status(200).json({ hasAccess, siteLive });
        } else {
            return res.status(200).json({ hasAccess: false, siteLive });
        }
    } catch (error) {
        console.error('Error checking access:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

