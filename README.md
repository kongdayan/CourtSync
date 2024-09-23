# Booking Service

This project is a Go-based service that sends automated booking requests to the API endpoint at `https://w5.ab.ust.hk/msalum/api/app/fbs/bookings`. The service is configured to run as a background system process using `systemd`, and it will automatically trigger requests every day at a specific time (7:59:50 AM UTC+8).

## Features

- Automatically runs every day at 7:59:50 AM (UTC+8) and finishes at 8:00:10 AM.
- Sends booking requests for a list of facilities every second during the scheduled time.
- Error handling and retry logic for failed requests.

## Prerequisites

- [Go](https://golang.org/doc/install) (Golang 1.18+)
- Linux system with `systemd` support
- Network access to `https://w5.ab.ust.hk/msalum/api/app/fbs/bookings`

## Installation

1. Clone the repository:

    ```bash
    git clone <repository-url>
    cd <project-directory>
    ```

2. Build the Go project:

    ```bash
    go build -o booking-service main.go
    ```

3. Move the executable to `/usr/local/bin`:

    ```bash
    sudo mv booking-service /usr/local/bin/
    sudo chmod +x /usr/local/bin/booking-service
    ```

## Running as a `systemd` Service

To run this project as a service, you'll need to create a `systemd` service file.

1. Create a `booking.service` file:

    ```bash
    sudo nano /etc/systemd/system/booking.service
    ```

2. Add the following configuration to the file:

    ```ini
    [Unit]
    Description=Booking Service
    After=network.target

    [Service]
    ExecStart=/usr/local/bin/booking-service
    Restart=always
    RestartSec=10
    User=nobody
    WorkingDirectory=/usr/local/bin/
    StandardOutput=syslog
    StandardError=syslog
    SyslogIdentifier=booking-service

    [Install]
    WantedBy=multi-user.target
    ```

3. Reload `systemd`:

    ```bash
    sudo systemctl daemon-reload
    ```

4. Start and enable the service:

    ```bash
    sudo systemctl start booking.service
    sudo systemctl enable booking.service
    ```

## Usage

Once the service is set up and running, it will automatically execute every day at 7:59:50 AM (UTC+8), sending requests for booking facilities `2`, `3`, `4`, and `5`.

You can monitor the service status using:

```bash
sudo systemctl status booking.service
```

To view logs:

```bash
sudo journalctl -u booking.service
```

## Configuration
You can modify the facilityIDs or the request scheduling by editing the main.go file.

To modify the API authorization token or adjust timeouts and retry logic, you can update the respective parts of the Go code.

## License
This project is licensed under the MIT License.

### Key Sections of the `README.md`:
- **Project Overview**: Describes the purpose of the project and its primary functionality.
- **Prerequisites**: Lists the required software and environment setup.
- **Installation**: Provides a step-by-step guide to setting up and installing the project.
- **Running as a `systemd` Service**: Explains how to set up the Go program to run automatically as a background service.
- **Usage**: Describes how to monitor the service and how it works.
- **Configuration**: Explains how to modify the code or configuration if needed.

Feel free to customize this `README` further according to any specific features or requirements of your project!






