# Strike Connect Systemd Service

## Installation

1. Copy the service file to systemd:
   ```bash
   sudo cp strike-connect.service /etc/systemd/system/
   ```

2. Edit the service file and replace placeholders:
   ```bash
   sudo nano /etc/systemd/system/strike-connect.service
   ```
   - Replace `<YOUR_USERNAME>` with your username (e.g., `username`)
   - Replace `<YOUR_GROUP>` with your group (usually same as username)
   - Verify `WorkingDirectory` and `ExecStart` paths are correct

3. Reload systemd to recognize the new service:
   ```bash
   sudo systemctl daemon-reload
   ```

4. Enable the service to start on boot:
   ```bash
   sudo systemctl enable strike-connect
   ```

5. Start the service:
   ```bash
   sudo systemctl start strike-connect
   ```

## Management Commands

Check status:
```bash
sudo systemctl status strike-connect
```

View logs:
```bash
sudo journalctl -u strike-connect -f
```

Stop service:
```bash
sudo systemctl stop strike-connect
```

Restart service:
```bash
sudo systemctl restart strike-connect
```

Disable autostart:
```bash
sudo systemctl disable strike-connect
```
