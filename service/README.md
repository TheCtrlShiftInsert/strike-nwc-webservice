# Strike Connect User Systemd Service

## Initial Setup (One-time)

This step must be done manually before the web UI can manage the service.

1. Copy the service file to user systemd:
   ```bash
   mkdir -p ~/.config/systemd/user
   cp service/strike-connect.service ~/.config/systemd/user/
   ```

2. Reload systemd to recognize the new service:
   ```bash
   systemctl --user daemon-reload
   ```

3. Enable the service to start on login:
   ```bash
   systemctl --user enable strike-connect
   ```

4. Start the service:
   ```bash
   systemctl --user start strike-connect
   ```

5. Access the web panel at http://localhost:2021

## Web UI Management

After initial setup, you can manage the service from the web panel at http://localhost:2021:

- **Install**: Install or reinstall the user service
- **Uninstall**: Remove the user service (stops it and disables auto-start)
- **Restart**: Restart the service (web page will disconnect and reload after 21 seconds)

## Management Commands (Manual)

Check status:
```bash
systemctl --user status strike-connect
```

View logs:
```bash
journalctl --user -u strike-connect -f
```

Stop service:
```bash
systemctl --user stop strike-connect
```

Restart service:
```bash
systemctl --user restart strike-connect
```

Disable autostart:
```bash
systemctl --user disable strike-connect
```
