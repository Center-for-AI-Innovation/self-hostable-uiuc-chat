// uploadToS3.ts
import express, { Request, Response } from 'express';
import { crawl } from './api/crawlee.js';
import healthRoute from './api/health.js'; // Import your health route

import cors from 'cors';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();

// const corsOptions = {
//     origin: 'https://uiuc.chat',
// };

// app.use(cors()); // Enable CORS for all routes and origins
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
        res.status(200).json({});
    } else {
        next();
    }
});
// app.use(cors(corsOptions)); // only certain routes
app.use(express.json());

app.post('/crawl', async (req: Request, res: Response) => {
    console.log('in /crawl. req.body:', req.body)
    try {
        // const { url, scrapeStrategy, match, exclude, maxPagesToCrawl, courseName, maxTokens, maxConcurrency, maxRequestsPerMinute } = req.body.params;
        // console.log('Top of /crawl -- got variables :) url:', url, 'scrapeStrategy:', scrapeStrategy, 'match', match, 'exclude', exclude, 'maxPagesToCrawl:', maxPagesToCrawl, 'maxTokens:', maxTokens, 'courseName:', courseName, 'maxConcurrency:', maxConcurrency, 'maxRequestsPerMinute:', maxRequestsPerMinute)

        // const params = req.body.params;
        // const config = {
        //     url: params.url,
        //     scrapeStrategy: params.scrapeStrategy,
        //     match: params.match,
        //     exclude: params.exclude, //  "https://www.facebook.com/**", "https://youtube.com/**", "https://linkedin.com/**", "https://instagram.com/**"
        //     maxPagesToCrawl: params.maxPagesToCrawl,
        //     courseName: params.courseName,
        //     maxTokens: params.maxTokens,
        //     // Use default values as specified in configSchema if undefined
        //     maxConcurrency: params.maxConcurrency,
        //     maxRequestsPerMinute: params.maxRequestsPerMinute,
        // };

        const results = await crawl(req.body.params);
        console.log(`Crawl completed successfully. Number of results: ${results}`);
        res.status(200).json(`Crawl completed successfully. Number of results: ${results}`);
    } catch (error) {
        const e = error as Error;
        res.status(500).json({ error: 'An error occurred during the upload', errorTitle: e.name, errorMessage: e.message });
    } finally {
        if (global.gc) {
            global.gc();
        }
    }
});

// add a health check route
app.use('/api', healthRoute); // GET /api/health


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
