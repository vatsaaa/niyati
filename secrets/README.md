# Secrets Directory
# Store production secrets here (never commit actual secret files)

## Usage
Create individual secret files for each credential:

```bash
# Database password
echo -n "your_secure_db_password" > postgres_password.txt

# SMTP credentials
echo -n "smtp_user@example.com" > smtp_user.txt
echo -n "smtp_password_here" > smtp_password.txt

# AWS credentials (for backups)
echo -n "AKIAIOSFODNN7EXAMPLE" > aws_access_key_id.txt
echo -n "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" > aws_secret_access_key.txt

# Worker token (for internal API calls)
echo -n "$(openssl rand -hex 32)" > worker_token.txt

# JWT secret
echo -n "$(openssl rand -hex 64)" > jwt_secret.txt
```

## Security Notes
- All `.txt` files in this directory are gitignored
- Use strong, randomly generated passwords
- Rotate secrets regularly
- Never commit secret files to version control
- Set file permissions: `chmod 600 secrets/*.txt`
- On server, store in secure location outside repo (e.g., `/etc/niyati/secrets/`)

## Production Deployment
For production servers, create secrets in a secure location:

```bash
# Create secrets directory on server
sudo mkdir -p /etc/niyati/secrets
sudo chmod 700 /etc/niyati/secrets

# Create secret files (example for postgres password)
echo -n "production_db_password" | sudo tee /etc/niyati/secrets/postgres_password.txt
sudo chmod 600 /etc/niyati/secrets/postgres_password.txt
```

Then update `docker-compose.prod.yml` to point to this directory.
