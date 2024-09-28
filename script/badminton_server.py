from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
from datetime import datetime, timedelta, time
import json
import requests
from script.config import user_tokens, user_header, location_dict, push_config
from threading import Thread, Event

app = Flask(__name__)
socketio = SocketIO(app)

notify_thread = Thread()
update_thread = Thread()
thread_stop_event = Event()
ava_slots = []  # Shared between threads

work_time_filter = True


class UpdateThread(Thread):
    def __init__(self):
        self.delay = 60  # 1 minute delay
        super(UpdateThread, self).__init__()

    def run(self):
        while not thread_stop_event.isSet():
            with app.app_context():
                raw_booking_url = "http://w5.ab.ust.hk/msalum/api/app/fbs/facility-timeslots?facility_id={id}&start_date={startdate}&end_date={enddate}"
                today_date = datetime.today()
                end_date = datetime.strftime(today_date + timedelta(days=7), "%Y-%m-%d")
                start_date = datetime.strftime(today_date, "%Y-%m-%d")
                ava_slots.clear()

                for code, string in location_dict.items():
                    res = json.loads(
                        requests.get(
                            raw_booking_url.format(
                                id=code, startdate=start_date, enddate=end_date
                            ),
                            headers=user_header,
                        ).text
                    )

                    if res["meta"]["code"] == 200:
                        data = res["data"]["facility_timeslots"]
                        for i in data:
                            if i["status"] == "Available":
                                time_obj = datetime.strptime(
                                    i["start_time"], "%H:%M"
                                ).time()

                                start_time = time(hour=18, minute=0)
                                end_time = time(hour=21, minute=0)

                                if work_time_filter:
                                    if start_time <= time_obj <= end_time:
                                        datetime_obj = datetime.strptime(
                                            i["date"] + " " + i["start_time"],
                                            "%Y-%m-%d %H:%M",
                                        )
                                        formatted_datetime = datetime_obj.strftime(
                                            "%-m月%-d日%H时"
                                        )
                                        booking_data = formatted_datetime + string
                                        ava_slots.append(booking_data)
                                else:
                                    datetime_obj = datetime.strptime(
                                        i["date"] + " " + i["start_time"],
                                        "%Y-%m-%d %H:%M",
                                    )
                                    formatted_datetime = datetime_obj.strftime(
                                        "%-m月%-d日%H时"
                                    )
                                    booking_data = formatted_datetime + string
                                    ava_slots.append(booking_data)

                thread_stop_event.wait(self.delay)


class NotifyThread(Thread):
    def __init__(self):
        self.delay = 5  # 5 seconds delay
        super(NotifyThread, self).__init__()

    def run(self):
        while not thread_stop_event.isSet():
            if len(ava_slots) > 0:
                socketio.emit("newdata", {"data": ava_slots}, namespace="/courtdata")
            thread_stop_event.wait(self.delay)


@app.route("/")
def index():
    return render_template("index.html")


@socketio.on("connect", namespace="/courtdata")
def test_connect():
    global notify_thread, update_thread
    print("Client connected")
    if not notify_thread.is_alive():
        print("Starting Notify Thread")
        notify_thread = NotifyThread()
        notify_thread.start()

    if not update_thread.is_alive():
        print("Starting Update Thread")
        update_thread = UpdateThread()
        update_thread.start()


@socketio.on("disconnect", namespace="/courtdata")
def test_disconnect():
    print("Client disconnected")


if __name__ == "__main__":
    socketio.run(app, debug=True, host="0.0.0.0", port=80)
