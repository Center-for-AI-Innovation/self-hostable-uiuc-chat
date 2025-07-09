# [In active development] Self Hostable UIUC.chat

## License

This project is available under [our Research Use Only license fully defined here](https://github.com/UIUC-Chatbot/self-hostable-ai-ta-backend/blob/main/ResearchUseONLYLicense-UIUC.CHAT.pdf). This license is similar in spirit to the [CC BY-NC 4.0 License](https://creativecommons.org/licenses/by-nc/4.0/) which restricts commercial use.

It's free to use for non-commercial use, like research. Any and all commercial use requires a commercial license, see below.

By contributing to this project, you accept the [CLA here](https://github.com/UIUC-Chatbot/self-hostable-ai-ta-backend/blob/main/CLA%20for%20Self%20Hostable%20UIUC.chat.pdf).

[![CC BY-NC 4.0 License Image](https://github.com/user-attachments/assets/21f4d62f-6a34-4e73-aae3-3129f81b8140)](https://creativecommons.org/licenses/by-nc/4.0/)

### Commercial Use

For commercial use of this project, you must obtain a separate commercial license. Please contact [otm@illinois.edu](mailto:otm@illinois.edu) and [ai@ncsa.illinois.edu](mailto:ai@ncsa.illinois.edu) to inquire about commercial licensing terms.

Failure to obtain a commercial license for commercial use is a violation of the terms of this project.

## Quickstart (Self host with Docker)

### 🎉 Get started with a single command

```bash
sudo bash init.sh
```
This will: 
* Create a `.env` file. You can customize this later to change the default passwords.
* Initialize all our databases (Redis, Minio, Qdrant, Postgres/Suapabse)
* Start the backend service running on http://localhost:3012 To customize HTTP port used as the main entrypoint, set the `FLASK_PORT` variabel in your `.env`.


To start fresh, you can use: 
```bash
# erase and factory reset all databases
sudo bash init.sh --wipe_data
```

### Configuring Postgres (Supabase)

It's strongly recommende to change your passwords away from the defaults. The Supabase .env file is separate from the rest of the code for seamless compatibility with Supabase's self hosted offering on github, and to maintain compatibility with their guides and general community information.
The .env file is stored in the local path: `./supabase/docker/.env`

### Configuring Database passwords

Customize your env variables. The SQL database can be any of SQLite, Postgres, and Supabase. The object storage can be Minio or AWS S3. 

### Take schema dump from Postgres (Supabase)
```bash
PGPASSWORD=<password> pg_dump -h aws-0-us-east-1.pooler.supabase.com -U postgres.twzwfuydgnnjcaopyfdv -d postgres --schema-only > schema.sql
```

### Restore dump in new Postgres
```bash
PGPASSWORD=<password> psql -h <new-hostname> -U <new-db> -d postgres -f schema.sql
```

Works on version: `Docker Compose version v2.27.1-desktop.1`

Works on Apple Silicon M1 `aarch64`, and `x86`.


### 🛠️ Technical Architecture

![Architecture diagram](https://github.com/UIUC-Chatbot/ai-ta-backend/assets/13607221/bda7b4d6-79ce-4d12-bf8f-cff9207c37af)

## Documentation

See docs on https://docs.uiuc.chat

## 📣 Development

## Fastest way to rebuild the images during dev

```bash
# rebuild only the frontend after file changes in that repo. Super quick, supports Docker's Layer Cache.
sudo bash init.sh --rebuild=uiuc-chat-frontend

# rebuild both frontend and backend after file changes
sudo bash init.sh --rebuild="uiuc-chat-frontend flask-app "
```

If you're interested in contributing, check out our [official developer quickstart](https://docs.uiuc.chat/developers/developer-quickstart).
