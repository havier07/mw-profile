"""
Basic Discord bot commands
Includes fundamental commands like help, ping, info, etc.
"""

import discord
from discord.ext import commands
import datetime
import json
import subprocess
import luadata
import re
import time
from io import BytesIO
from PIL import Image
import requests


class MiniWorldCommands(commands.Cog, name="Mini World"):
    """Basic bot commands and utilities"""

    def __init__(self, bot, config):
        self.bot = bot
        self.config = config

    @commands.command(name="mwp5", aliases=[])
    async def mwp5_command(self, ctx, *, args=None):
        def formatId(num):
            try:
                num = int(num)
                return num + 10**9 if len(str(num)) < 10 else num
            except (ValueError, TypeError):
                return None

        def fetch_data(str_list):
            if not str_list:
                return None, ("Danh sách UID trống.")
            url = f"http://shequ.miniworldgame.com:8080/miniw/profile/?act=getProfileBatch&op_uin_list={str_list}&time=1753000710&auth=f372fa25c15b56111fb65287e0fd7870&s2t=1753000576&uin=1308706682"
            try:
                result = subprocess.run(
                    ["curl", "--connect-timeout", "30", "--max-time", "60", url],
                    capture_output=True,
                    text=True,
                    encoding='utf-8'
                )

                if result.returncode != 0:
                    return None, (f"Lỗi curl: {result.stderr}")

                response = result.stdout.strip()
                if not response:
                    return None, ("Không nhận được dữ liệu từ API.")

                return True, response

            except subprocess.SubprocessError as e:
                return None, (f"Lỗi khi gọi curl: {e}")

        def find_key(data, key):
            if not data or not key:
                return None
            keys = [k.strip() for k in key.split(">>")]

            def recursive_search(d, key_path):
                if not key_path:
                    return None
                current_key = key_path[0]

                if isinstance(d, dict):
                    if current_key in d:
                        if len(key_path) == 1:
                            return d[current_key]
                        else:
                            return recursive_search(d[current_key], key_path[1:])
                    else:
                        # Nếu không thấy key, tiếp tục tìm sâu hơn trong các value con
                        for value in d.values():
                            result = recursive_search(value, key_path)
                            if result is not None:
                                return result

                elif isinstance(d, list):
                    for item in d:
                        result = recursive_search(item, key_path)
                        if result is not None:
                            return result

                return None

            return recursive_search(data, keys)

        def escape_markdown(text: str) -> str:
            if not isinstance(text, str):
                return text
            #escape_chars = ['\\', '*', '_', '~', '`', '|', '>', '[', ']', '(', ')']
            escape_chars = ['\\', '*', '_', '~', '`', '|', '>']
            for char in escape_chars:
                text = text.replace(char, f'\\{char}')
            return text

        def replace_slash_number(text: str) -> str:
            if not isinstance(text, str):
                return text
            # Pattern: tìm các chuỗi dạng \1 đến \20
            pattern = r'\\([1-9]|1[0-9]|20)\b'
            return re.sub(pattern, ' ', text)

        def format_timestamp_vn(ts):
            if not ts:
                return "N/A"

            dt_object = datetime.datetime.fromtimestamp(ts)
            weekdays_vn = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
            weekday_vn = weekdays_vn[dt_object.weekday()]

            return f"{weekday_vn}, {dt_object:%d/%m/%Y %H:%M:%S}"

        def is_transparent_png(url: str) -> bool:
            if not url or not url.lower().endswith('.png'):
                return False
            try:
                response = requests.get(url)
                response.raise_for_status()
                img = Image.open(BytesIO(response.content)).convert("RGBA")
                alpha = img.getchannel("A")

                return all(pixel == 0 for pixel in alpha.getdata())
            except Exception as e:
                print(f"Lỗi khi kiểm tra ảnh: {e}")
                return False

        def is_url_accessible(url):
            try:
                response = requests.head(url, timeout=5)
                return response.status_code == 200
            except requests.exceptions.RequestException:
                return False

        def parse_string_to_ansi(text_string):
            if not text_string:
                return ""
            ansi_code = {
                '#R': '31',
                '#Y': '33',
                '#K': '30',
                '#B': '34',
                '#G': '32',
                '#W': '37',
                '#L': '4',
                '#n': '0'
            }

            def hex_to_ansi(hex_color):
                hex_color = hex_color.upper()

                if hex_color in ['FF0000', 'FF0000']: return '31'
                if hex_color in ['FFFF00']: return '33'
                if hex_color in ['000000']: return '30'
                if hex_color in ['0000FF']: return '34'
                if hex_color in ['00FF00']: return '32'
                if hex_color in ['FFFFFF']: return '37'

                r = int(hex_color[0:2], 16)
                g = int(hex_color[2:4], 16)
                b = int(hex_color[4:6], 16)

                if r > g and r > b: return '31'
                if g > r and g > b: return '32'
                if b > r and b > g: return '34'

                if r > 128 or g > 128 or b > 128: return '37'
                return '30'

            pattern = r'#c[0-9a-fA-F]{6}|#R|#Y|#K|#B|#G|#W|#L|#n'
            result = ""
            last_pos = 0

            for match in re.finditer(pattern, text_string):
                start, end = match.span()
                full_match = match.group(0)

                result += text_string[last_pos:start]

                if full_match.startswith('#c'):
                    hex_color = full_match[2:]
                    ansi_code_str = hex_to_ansi(hex_color)
                else:
                    ansi_code_str = ansi_code.get(full_match, '0')

                result += f'\033[{ansi_code_str}m'
                result += full_match

                last_pos = end

            result += text_string[last_pos:]

            return result + '\033[0m'

        def string_to_timestamp(date_string):
            dt_object = datetime.datetime.strptime(date_string, "%Y%m%d")
            dt_object_7h = dt_object + datetime.timedelta(hours=7)
            timestamp = int(dt_object_7h.timestamp())

            return timestamp

        #await ctx.send(content = f"Đang xử lý dữ liệu đầu vào..")

        if args is None:
            embed = discord.Embed(
                title = ":warning:",
                description = "Vui lòng nhập ít nhất một UID người chơi!",
                color=discord.Color.red()
            )
            await ctx.send(embed=embed)
            return

        params = args.split()
        player_ids = []
        arg_errs = []

        if params[0] == "-d":
            debug = True

            if len(params) < 2:
                embed = discord.Embed(
                    title = ":warning:",
                    description = "Vui lòng nhập ít nhất một UID người chơi!",
                    color=discord.Color.red()
                )
                await ctx.send(embed=embed)
                return
            params = params[1:]
        else:
            debug = False

        for param in params:
            try:
                number = int(param)
                player_ids.append(formatId(number))
            except ValueError:
                arg_errs.append(param)

        if arg_errs:
            formatted_errs = [f"` {err} `" for err in arg_errs]
            error_message = " • ".join(formatted_errs)
            errs = len(arg_errs)

            embed = discord.Embed(
                title = f":warning: Phát hiện {errs} tham số đầu vào không hợp lệ",
                description = error_message,
                color = discord.Color.red()
            )
            await ctx.send(embed=embed)

        str_list = ",".join(map(str, player_ids))
        #message = await ctx.send(f":computer: Đang lấy dữ liệu UID `{str_list}`")
        result, response_data = fetch_data(str_list)

        if not result:
            embed = discord.Embed(
                title = ":warning: Lỗi khi lấy dữ liệu",
                description = response_data,
                color = discord.Color.red()
            )
            await ctx.send(content=None, embed=embed)
            return
        elif not response_data or len(response_data) == 0:
            embed = discord.Embed(
                title = ":warning: Lỗi khi lấy dữ liệu",
                description = "Không thể lấy dữ liệu người chơi. Vui lòng thử lại sau.",
                color = discord.Color.red()
            )
            await ctx.send(content=None, embed=embed)
            return
        else:
            #await message.delete()
            #message = await ctx.send(content = "Lấy dữ liệu thành công, đang chuyển đổi dữ liệu..")
            response_data = luadata.unserialize(response_data, encoding = "utf-8", multival = False)
            #await message.delete()
            #message = await ctx.send(content = "Chuyển đổi dữ liệu thành công")

            #await ctx.send(content = f"Đang xử lý dữ liệu của {len(response_data)} người chơi..")
            for idx in range(len(response_data)):
                user_data = response_data[idx]
                if debug:
                    message = await ctx.send(content = f"Đang xử lý dữ liệu của UID `{player_ids[idx]}`..")
                    time.sleep(0.25)

                if not find_key(user_data, "uin") or not find_key(user_data, "NickName"):
                    embed = discord.Embed(
                        title = ":warning: Lỗi khi lấy dữ liệu",
                        description = f"Không thể lấy dữ liệu UID `{player_ids[idx]}`",
                        color = discord.Color.red()
                    )
                    await ctx.send(content=None, embed=embed)
                    continue
                else:
                    try:
                        uid = find_key(user_data, "uin")                                        # uid người chơi
                        nickname = find_key(user_data, "NickName")                              # tên người chơi
                        dev_level = find_key(user_data, "creator >> level")                     # cấp độ dev
                        gender = find_key(user_data, "gender")                                  # giới tính 0: bảo mật, 1: nam, 2: nữ
                        frame_id = find_key(user_data, "head_frame_id")                         # id khung avatar
                        country = find_key(user_data, "country")                                # quốc gia
                        show_country = find_key(user_data, "show_country")                      # có hiện quốc gia không
                        has_avt = find_key(user_data, "HasAvatar")                              # có avatar không
                        mood_icon = find_key(user_data, "mood_icon")                            # icon trạng thái
                        mood_text = find_key(user_data, "mood_text")                            # trạng thái
                        skin_id = find_key(user_data, "SkinID")                                 # id trang phục
                        update_time = find_key(user_data, "_t_")                                # thời điểm nhận request
                        dl_count = find_key(user_data, "all_download_count")                    # số lượt tải
                        lang = find_key(user_data, "lang")                                      # ngôn ngữ
                        report_list = find_key(user_data, "report_rt")                          # list vé report
                        white_list_ts = find_key(user_data, "rt_white")                         # thời điểm được thêm vào danh sách trắng
                        signature = find_key(user_data, "signature")                            # chữ kí
                        photo = find_key(user_data, "photo")                                    # list photo
                        photo_unlock = find_key(user_data, "photo_unlock")                      # số lượng photo đã mở khóa
                        model = find_key(user_data, "Model")                                    # id nhân vật
                        custom_avt = find_key(user_data, "header >> url")                       # có avatar tùy chỉnh không
                        default_avt = find_key(user_data, "header2 >> url")                     # avatar mặc định
                        custom_skin_time = find_key(user_data, "custom_skin >> cc_time")        # thời điểm tạo skin diy
                        expert = find_key(user_data, "expert")                                  # dict người sành sỏi

                        gender_text = [
                            "🔒 Bảo mật",   # Ẩn giới tính
                            "🙎‍♂️ Nam",       # Nam
                            "🙎‍♀️ Nữ"         # Nữ
                        ]

                        lang_text = {
                            1: "🇺🇸 Tiếng Anh",
                            2: "🇨🇳 Tiếng Trung",
                            3: "🇹🇭 Tiếng Thái",
                            4: "🇪🇸 Tiếng Tây Ban Nha",
                            5: "🇵🇹 Tiếng Bồ Đào Nha",
                            6: "🇫🇷 Tiếng Pháp",
                            7: "🇯🇵 Tiếng Nhật",
                            8: "🇸🇦 Tiếng Ả Rập",
                            9: "🇰🇷 Tiếng Hàn",
                            10: "🇻🇳 Tiếng Việt",
                            11: "🇷🇺 Tiếng Nga",
                            12: "🇹🇷 Tiếng Thổ Nhĩ Kỳ",
                            13: "🇮🇹 Tiếng Ý",
                            14: "🇩🇪 Tiếng Đức",
                            15: "🇮🇩 Tiếng Indonesia",
                            16: "🇲🇾 Tiếng Malaysia"
                        }

                        flag_icon = {
                            "US": "🇺🇸 Hoa Kỳ",
                            "CN": "🇨🇳 Trung Quốc",
                            "TW": "🇹🇼 Đài Loan",
                            "TH": "🇹🇭 Thái Lan",
                            "ES": "🇪🇸 Tây Ban Nha",
                            "PT": "🇵🇹 Bồ Đào Nha",
                            "FR": "🇫🇷 Pháp",
                            "JP": "🇯🇵 Nhật Bản",
                            "SA": "🇸🇦 Ả Rập Xê Út",
                            "KR": "🇰🇷 Hàn Quốc",
                            "VN": "🇻🇳 Việt Nam",
                            "RU": "🇷🇺 Nga",
                            "TR": "🇹🇷 Thổ Nhĩ Kỳ",
                            "IT": "🇮🇹 Ý",
                            "DE": "🇩🇪 Đức",
                            "ID": "🇮🇩 Indonesia",
                            "MY": "🇲🇾 Malaysia"
                        }

                        if debug:
                            await message.edit(content = f"Đang tạo embed cho người chơi `{nickname}`..")
                            time.sleep(0.25)

                        user_gender = gender_text[gender] if (gender in [0, 1, 2]) else "N/A"
                        user_country = flag_icon[country] if (country in flag_icon) else country if (country) else "N/A"
                        user_lang = lang_text[lang] if (lang in lang_text) else "N/A"
                        user_mood_icon = mood_icon if mood_icon else "N/A"
                        user_mood_text = replace_slash_number(mood_text) if mood_text else "N/A"
                        user_skin = skin_id if skin_id else "N/A"
                        user_model = model if model else "N/A"
                        user_diy = f"<t:{custom_skin_time}:R>" if custom_skin_time else "N/A"
                        user_dev_level = dev_level if dev_level else 0
                        user_dl_count = dl_count if dl_count else 0
                        user_frame_id = frame_id if frame_id else 0
                        user_update_str = f"Cập Nhật: {format_timestamp_vn(update_time)} ( <t:{update_time}:R> )\n" if update_time else ""

                        embed = discord.Embed(
                            title = "⋘  Thông Tin Người Chơi  ⋙",
                            description = f"{user_update_str} •  ✧ㅤ[ Data Source ](http://shequ.miniworldgame.com:8080/miniw/profile/?act=getProfileBatch&op_uin_list={uid}&time=1753000710&auth=f372fa25c15b56111fb65287e0fd7870&s2t=1753000576&uin=1308706682)ㅤ✧  •",
                            color = discord.Color.green()
                        )

                        if debug:
                            await message.edit(content = f"Đang tạo thumb cho người chơi `{nickname}`..")
                            time.sleep(0.25)

                        if custom_avt:
                            embed.set_thumbnail(url = custom_avt)
                        else:
                            if not is_transparent_png(default_avt):
                                embed.set_thumbnail(url = default_avt)

                        if debug:
                            await message.edit(content = f"Đang tạo field `👤 Người Chơi` cho người chơi `{nickname}`..")
                            time.sleep(0.25)

                        player_field = f"»  **Tên**:  **{escape_markdown(replace_slash_number(nickname))}**\n»  **UID**:  `{uid}`\n»  **Giới Tính**:  {user_gender}\n»  **Quốc Gia**:  {user_country}\n»  **Ngôn Ngữ**:  {user_lang}\n"
                        embed.add_field(name = "👤 Người Chơi", value = player_field, inline = True)

                        if debug:
                            await message.edit(content = f"Đang tạo field `🌦️ Tâm Trạng` cho người chơi `{nickname}`..")
                            time.sleep(0.25)

                        mood_field = f"»  **Tiểu Sử**:  `#{user_mood_icon}`\n```ansi\n{parse_string_to_ansi(user_mood_text)}```"
                        embed.add_field(name = "🌦️ Tâm Trạng", value = mood_field, inline = True)
                        embed.add_field(name = "", value = "", inline = True)

                        if debug:
                            await message.edit(content = f"Đang tạo field `☃️ Nhân Vật` cho người chơi `{nickname}`..")
                            time.sleep(0.25)

                        char_field = f"»  **Nhân Vật**:  `{user_model}`\n»  **Trang Phục**:  `{user_skin}`\n»  **Skin DIY**:  {user_diy}"
                        embed.add_field(name = "☃️ Nhân Vật", value = char_field, inline = True)

                        if debug:
                            await message.edit(content = f"Đang tạo field `🔧 Nhà Phát Triển` cho người chơi `{nickname}`..")
                            time.sleep(0.25)

                        dev_field = f"»  **Cấp Độ**:  `{user_dev_level}`\n»  **Lượt Tải**:  `{user_dl_count}`\n»  **Khung Avatar**:  `{user_frame_id}`"
                        embed.add_field(name = "🔧 Nhà Phát Triển", value = dev_field, inline = True)
                        embed.add_field(name = "", value = "", inline = True)

                        if expert:
                            if debug:
                                await message.edit(content = f"Đang tạo field `🏅 Người Sành Sỏi` cho người chơi `{nickname}`..")
                                time.sleep(0.25)

                            expert_status = find_key(expert, "stat")                                # trạng thái người sành sỏi
                            expert_time = find_key(expert, "invite_time")                           # thời điểm trở thành người sành sỏi
                            expert_score = find_key(expert, "score")                                # điểm người sành sỏi
                            expert_score_max = find_key(expert, "score_max")                        # điểm tối đa người sành sỏi
                            expert_point = find_key(expert, "points")                               # điểm tin cậy người sành sỏi
                            expert_level = find_key(expert, "level")                                # cấp độ người sành sỏi

                            exp_score = expert_score if isinstance(expert_score, int) else "N/A"
                            exp_score_max = expert_score_max if isinstance(expert_score_max, int) else "N/A"
                            exp_point = expert_point if isinstance(expert_point, int) else "N/A"
                            exp_level = expert_level if isinstance(expert_level, int) else "N/A"
                            exp_status = expert_status if isinstance(expert_status, int) else "N/A"
                            exp_time = expert_time if isinstance(expert_time, int) else "N/A"

                            expert_field = f"»  **Trạng Thái**:  `{exp_status}`\n»  **Cấp Độ**:  `{exp_level}`\n»  **Điểm Hiện Tại**:  `{exp_score}`\n»  **Điểm Tối Đa**:  `{exp_score_max}`\n»  **Điểm Tin Cậy**:  `{exp_point}`\n»  **Thời Gian**:  <t:{exp_time}:R>"
                            embed.add_field(name = "🏅 Người Sành Sỏi", value = expert_field, inline = True)

                        if debug:
                            await message.edit(content = f"Đang tạo field `✨ Uy Tín` cho người chơi `{nickname}`..")
                            time.sleep(0.25)

                        whitelist_info = f"»  **Danh Sách Trắng**:  <t:{white_list_ts}:R>\n" if white_list_ts else ""
                        legit_field = f"{whitelist_info}»  **Bị Tố Cáo**:  `{len(report_list) if report_list else 0}` lần"
                        embed.add_field(name = "✨ Uy Tín", value = legit_field, inline = True)

                        embeds = [embed]

                        guild = ctx.guild
                        server_icon_url = guild.icon.url if guild.icon else None

                        if debug:
                            await message.edit(content = f"Đang tạo footer cho người chơi `{nickname}`..")
                            time.sleep(0.25)

                        embed.set_footer(text = f"{format_timestamp_vn(time.time())}", icon_url = server_icon_url)

                        #json_bytes = json.dumps(user_data, indent = 4).encode("utf-8")
                        #json_file = discord.File(BytesIO(json_bytes), filename = f"Profile_{uid}.json")

                        #message.delete()
                        #await ctx.send(content = None, embed = embed, file = json_file)

                        if debug:
                            await message.edit(content = f"Đang gửi embed của người chơi `{nickname}`..")
                            time.sleep(0.25)

                        try:
                            await ctx.send(content = None, embeds = embeds)
                            if debug:
                                await message.delete()

                        except Exception as e:
                            embed = discord.Embed(
                                title = ":warning: Lỗi Xảy Ra",
                                description = f"{e}",
                                color = discord.Color.red()
                            )
                            await ctx.send(content = None, embed = embed)
                            continue

                        if photo:
                            if debug:
                                await message.edit(content = f"Đang tạo `📷 Album` cho người chơi `{nickname}`..")
                                time.sleep(0.25)

                            if isinstance(photo, dict):
                                raw_photo_list = list(photo.values())
                            else:
                                raw_photo_list = photo

                            if not isinstance(raw_photo_list, list) or not raw_photo_list:
                                return

                            filtered_photo_list = [
                                item for item in raw_photo_list if is_url_accessible(find_key(item, "url"))
                            ]

                            if not filtered_photo_list:
                                await ctx.send(f"Không có ảnh hợp lệ nào được tìm thấy cho người chơi `{nickname}`.")
                                return

                            photo_count = len(filtered_photo_list)
                            photo_groups_by_8 = [filtered_photo_list[i:i + 8] for i in range(0, photo_count, 8)]

                            current_photo_index = 0

                            for group_of_8 in photo_groups_by_8:
                                embeds_for_message = []

                                sub_groups_of_4 = [group_of_8[i:i + 4] for i in range(0, len(group_of_8), 4)]

                                for sub_group_of_4 in sub_groups_of_4:
                                    if not sub_group_of_4:
                                        continue

                                    first_photo_url = find_key(sub_group_of_4[0], "url")

                                    group_embed = discord.Embed(
                                        title=f"📷 Album Của {escape_markdown(replace_slash_number(nickname))} ({current_photo_index + 1} - {current_photo_index + len(sub_group_of_4)} / {photo_count})",
                                        url=first_photo_url, 
                                        color=discord.Color.blue()
                                    )

                                    image_embeds = []

                                    for photo_item in sub_group_of_4:
                                        photo_url = find_key(photo_item, "url")
                                        photo_dir = find_key(photo_item, "dir")
                                        current_photo_index += 1

                                        try:
                                            timestamp_str = f"<t:{string_to_timestamp(photo_dir)}:R>" if photo_dir else "N/A"
                                        except (ValueError, TypeError):
                                            timestamp_str = "N/A"

                                        source_url = photo_url or "#"

                                        field_name = f"Ảnh {current_photo_index}"
                                        field_value = f"**Thời Gian**: {timestamp_str}\n•  ✧ㅤ[ Photo Source ]({source_url})ㅤ✧  •"
                                        group_embed.add_field(name=field_name, value=field_value, inline=True)

                                        if current_photo_index % 2 == 0:
                                             group_embed.add_field(name="", value="", inline=True)

                                        image_embed = discord.Embed(url=first_photo_url)
                                        image_embed.set_image(url=photo_url)
                                        image_embeds.append(image_embed)

                                    embeds_for_message.append(group_embed)
                                    embeds_for_message.extend(image_embeds)

                                if embeds_for_message:
                                    await ctx.send(embeds=embeds_for_message)

                    except Exception as e:
                        embed = discord.Embed(
                            title = ":warning: Lỗi Xảy Ra",
                            description = f"{e}",
                            color = discord.Color.red()
                        )
                        await ctx.send(content = None, embed = embed)
                        continue



def setup(bot):
    """Load the cog"""
    return MiniWorldCommands(bot, bot.config)
