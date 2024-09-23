# -*- coding: UTF-8 -*-
from datetime import datetime, timedelta, time, date
import json
import requests
from config import user_tokens, user_header, location_dict, push_config
import urllib3

http = urllib3.PoolManager()
push_url = push_config["server"]


def send_mantain_notify():
    for user, token in user_tokens.items():
        notify_url = push_url.format(key=token) + "[抢场地]API过期了"
        # print(notify_url)
        # requests.get(notify_url,timeout=2)
        response = http.request("GET", notify_url)


def send_notify(data):
    for key in user_tokens.values():
        notify_url = push_url.format(key=key) + "[抢场地]" + str(data)
        # requests.get(notify_url)
        response = http.request("GET", notify_url)


raw_booking_url = "https://w5.ab.ust.hk/msalum/api/app/fbs/facility-timeslots?facility_id={id}&start_date={startdate}&end_date={enddate}"
today_date = datetime.today()
end_date = datetime.strftime(today_date + timedelta(days=7), "%Y-%m-%d")
start_date = datetime.strftime(today_date, "%Y-%m-%d")
ava_slots = []


print("遍历各个球场未来7天状态")
for code, string in location_dict.items():
    goal_url = raw_booking_url.format(id=code, startdate=start_date, enddate=end_date)
    # print(goal_url)
    res = json.loads(requests.get(goal_url, headers=user_header).text)
    # print(res)
    # 解析数据，查看返回的数据中 是否标识成功
    if res["meta"]["code"] == 200:
        data = res["data"]["facility_timeslots"]
        # print(data)
        for i in data:
            # print(i)
            if i["status"] == "Available":
                # 将日期时间字符串转换为时间对象
                time_obj = datetime.strptime(i["start_time"], "%H:%M").time()

                # 设定开始时间和结束时间
                start_time = time(hour=12, minute=0)
                end_time = time(hour=21, minute=0)

                # 判断时间是否在范围内
                if start_time <= time_obj <= end_time:
                    # 将日期时间字符串转换为 datetime 对象
                    datetime_obj = datetime.strptime(
                        i["date"] + " " + i["start_time"], "%Y-%m-%d %H:%M"
                    )

                    # 格式化 datetime 对象为字符串
                    formatted_datetime = datetime_obj.strftime("%-m月%-d日%H时")
                    booking_data = formatted_datetime + string
                    ava_slots.append(booking_data)
    else:
        # API过期
        print(res)
        send_mantain_notify()
        break
if len(ava_slots) > 0:
    print(ava_slots)
    send_notify(ava_slots)
else:
    # 没有可用场地
    print("无可预约场地")
    # send_mantain_notify()
