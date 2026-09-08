import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

export type Locale = 'en' | 'zh';
export type Interpolation = Record<string, string | number>;
export type Translator = (english: string, values?: Interpolation) => string;

const LOCALE_KEY = '@mealogue/locale';

const zh: Record<string, string> = {
  'Your table & settings': '你的餐桌与设置',
  'Sample memory': '示例回忆',
  'This table has not named its seats yet.': '这张餐桌还没有记下同伴。',
  'Choose the companionship that best fits this date.': '选一种最贴近这天的相伴方式。',
  'Log a meal first, then return here to remember who was around the table.': '先记下一餐，再回来记住同桌的人。',
  Companionship: '相伴方式', '{month} {year}': '{year}年{month}',
  '{count} meal remembered': '记下了 {count} 餐', '{count} meals remembered': '记下了 {count} 餐',
  '{count} more {unit} to find this keepsake.': '还需 {count} {unit}，即可发现这件纪念。',
  meals: '餐', months: '个月', seasons: '个季节', notes: '篇笔记', feelings: '次心情记录',
  people: '位同伴', moments: '个时刻', breakfasts: '顿早餐',
  'meal days in one month': '天同月用餐记录', 'meal photographs': '张用餐照片', 'shared photographs': '张同桌照片',
  'shared meals with one person': '次与同一人的用餐', 'people at one meal': '位同餐伙伴',
  'days between shared meals': '天同桌间隔', 'seasons with one person': '个同桌季节',
  'late meals': '顿深夜用餐', Sundays: '个星期日',
  'Fork + knife': '刀叉', 'Chopsticks': '筷子', 'Fork + spoon': '叉勺',
  'Most direct and readable at tab size.': '在标签栏尺寸下最直观清晰。',
  'Quiet and elegant, but less instantly readable in the small bar.': '安静优雅，但在小标签栏中稍难辨认。',
  'Friendly and soft, slightly less refined than fork + knife.': '亲切柔和，精致感略逊于刀叉。',
  Home: '首页', Archive: '回忆', Add: '记录', Insights: '洞察', Collection: '收藏',
  Back: '返回', Cancel: '取消', Close: '关闭', Continue: '继续', Save: '保存',
  Edit: '编辑', Delete: '删除', Remove: '移除', Retry: '重试', Done: '完成',
  'Saving...': '保存中...', 'Loading...': '加载中...', 'Please try again in a moment.': '请稍后重试。',
  'Could not load your meals.': '未能加载用餐记录。',
  'Could not load people.': '未能加载同行的人。',
  'Could not load this memory.': '未能加载这段回忆。',
  'Could not load this person.': '未能加载此人的资料。',
  'Could not load keepsakes.': '未能加载纪念收藏。',
  'Could not save these changes. Please try again.': '未能保存更改，请重试。',
  'Could not save this person. Please try again.': '未能保存此人的资料，请重试。',
  'Could not save this photo. Please try again.': '未能保存照片，请重试。',
  'Could not open photos. Please try again.': '未能打开照片，请重试。',
  'Could not delete this memory. Please try again.': '未能删除这段回忆，请重试。',
  'Could not delete this person. Please try again.': '未能删除此人的资料，请重试。',
  'Could not merge these people. Please try again.': '未能合并这些资料，请重试。',
  'Breakfast': '早餐', Lunch: '午餐', Dinner: '晚餐', Snack: '加餐', Treat: '小食', Treats: '小食',
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐', treat: '小食', treats: '小食',
  B: '早', L: '午', D: '晚', T: '食', M: '餐', Pe: '伴', Ph: '照',
  Peaceful: '平静', Everyday: '日常', Nostalgic: '怀念', Healing: '治愈',
  Heartfelt: '暖心', Overwhelming: '心绪纷杂', Celebratory: '喜悦',
  peaceful: '平静', everyday: '日常', nostalgic: '怀念', healing: '治愈',
  heartfelt: '暖心', overwhelming: '心绪纷杂', celebratory: '喜悦',
  Friend: '朋友', Partner: '伴侣', Family: '家人', Parent: '父母', Child: '孩子',
  Colleague: '同事', Classmate: '同学', Guest: '客人', Other: '其他',
  'Just me today': '今天独自用餐', 'Family table': '家人同桌',
  'Shared with a friend': '与朋友同享', 'Work lunch': '工作午餐',
  'Celebration gathering': '庆祝相聚', 'New encounter': '初次相逢',
  'A quiet meal kept for yourself.': '留给自己的一顿安静饭。',
  'A meal held by familiar closeness.': '熟悉的亲近，围坐成一顿饭。',
  'Conversation, ease, and something shared.': '闲聊、自在，还有一起分享的滋味。',
  'A table folded into the workday.': '工作日里的一桌饭。',
  'A meal with a little ceremony around it.': '带着一点仪式感的相聚。',
  'Someone new found a seat at the table.': '新认识的人，也在桌边坐下。',
  January: '一月', February: '二月', March: '三月', April: '四月', May: '五月', June: '六月',
  July: '七月', August: '八月', September: '九月', October: '十月', November: '十一月', December: '十二月',
  Jan: '1月', Feb: '2月', Mar: '3月', Apr: '4月', Jun: '6月', Jul: '7月', Aug: '8月', Sep: '9月', Oct: '10月', Nov: '11月', Dec: '12月',
  Sun: '日', Mon: '一', Tue: '二', Wed: '三', Thu: '四', Fri: '五', Sat: '六', TOD: '今', Today: '今天',
  Spring: '春天', Summer: '夏天', Autumn: '秋天', Winter: '冬天',
  'Keep a record of your meals every day': '把每天的用餐时光留下来',
  Catering: '用餐', People: '同行的人',
  'This part of the table is still quiet.': '这时的餐桌，还是安静的。',
  'No meals at this table yet': '这天还没有用餐记录',
  'When you save a meal for this date, it will settle here by breakfast, lunch, dinner, or treats.': '记下这天的一餐，它就会出现在早餐、午餐、晚餐或小食里。',
  "Today's table": '这天的餐桌', 'Seats Around the Table': '餐桌旁的座位',
  'A softer record of who shared the meal, and what kind of table it became.': '轻轻记下与谁同桌，以及这顿饭的模样。',
  'Meal companions': '用餐同伴', 'Saved as reusable people profiles.': '保存为人物资料，方便下次同桌。',
  'Save a meal first, then add people to its table.': '先记下一餐，再添加同桌的人。',
  '+ People': '+ 同伴', 'At this table': '在这张餐桌旁',
  'No one has taken a seat yet.': '还没有人在这里落座。',
  'Add someone the next time you share a meal.': '下次一起吃饭时，记下同桌的人。',
  'Table context': '同桌时光', 'Keep a softer note': '留下一点同桌的感受',
  'Table Context': '同桌时光', 'A quiet table today': '今天的餐桌很安静',
  'Save a meal first, then note who shared the table.': '先记下一餐，再记录与谁同桌。',
  'Choose the kind of company this day held.': '记下这天相伴的方式。',
  '{count} meal': '{count} 餐', '{count} meals': '{count} 餐', '{count} shared meals': '{count} 次同桌用餐',
  '{count} meals logged': '已记录 {count} 餐', '{count} day with meals': '{count} 天有用餐记录',
  '{count} days with meals': '{count} 天有用餐记录', '{count} people at the table': '{count} 位同桌的人',
  '{count} photographs': '{count} 张照片', '{count} memory': '{count} 段回忆', '{count} memories': '{count} 段回忆',
  memory: '回忆', memories: '回忆', day: '天', days: '天',
  'Shared with {name}': '与 {name} 同享', 'Shared with {first} and {second}': '与 {first}、{second} 同享',
  'Shared with {first}, {second}, and {count} others': '与 {first}、{second} 及另外 {count} 人同享',
  'A month with photographs at the table.': '这个月，餐桌旁留下了照片。',
  'A table with company remembered.': '记得这张餐桌，也记得同桌的人。',
  'A month held by small feelings.': '小小的心情，留住了这个月。',
  'Each month, a new table is set.': '每个月，都有一张新餐桌。',
  'This month is still quiet.': '这个月还很安静。',
  'The calendar is ready, and meal memories will gather here when they arrive.': '日历已经备好，用餐回忆会慢慢聚在这里。',
  Calendar: '日历', Memories: '回忆', 'Month table': '本月餐桌',
  'Tap a day to open its table': '点选日期，看看那天的餐桌', Meal: '用餐', Photo: '照片',
  'Mealog archive': 'Mealog 回忆档案', 'Month memories': '每月回忆',
  'A wall of tables, photographs, and small things that stayed.': '餐桌、照片，还有那些留在心里的小事。',
  'People at my table': '我的同桌伙伴', 'Current table': '当前餐桌',
  'This day': '这一天', 'Meal memories at this table': '这张餐桌的用餐回忆',
  'Choose a month': '选择月份', 'No meals on this day yet.': '这天还没有用餐记录。', 'Add a meal': '记下一餐',
  'Delete {name}?': '删除 {name}？', 'Delete person': '删除人物',
  'This soft-deletes the profile only. Meal memories stay in the archive.': '只移除人物资料，用餐回忆仍保留在档案中。',
  'Add person': '添加同伴', 'Reusable people profiles for the meals you share. Mealog never reads contacts.': '记下与你一起吃饭的人，方便下次同桌。Mealog 不会读取通讯录。',
  'Search by name or relationship': '搜索姓名或关系', 'Recent shared': '最近同桌', 'Most shared': '同桌最多',
  'Merge duplicate names': '合并重复姓名', '{count} possible duplicate group found.': '发现 {count} 组可能重复的资料。',
  'A remembered seat': '记忆中的同伴', 'Last shared: {date}': '上次同桌：{date}', 'not yet': '还没有',
  'No one found.': '没有找到这个人。', 'Add this person to your table.': '把这个人添加到你的餐桌。',
  'Opening this seat...': '正在打开这个座位...', 'This person could not be found.': '未找到此人的资料。',
  'Edit person': '编辑人物', 'Deleted person': '已删除的人物', 'shared meals': '同桌用餐', photographs: '照片',
  'First meal together: {date}': '初次同桌：{date}', 'Recently shared: {date}': '最近同桌：{date}',
  'Shared meals': '同桌用餐', 'No shared meals yet.': '还没有一起用餐的记录。',
  'Shared photographs': '同桌照片', 'Together at this table': '一起围坐在这张餐桌旁',
  'No shared photographs yet.': '还没有同桌照片。', 'Notes mentioning this person': '提到这个人的笔记',
  'No notes mention this person yet.': '还没有笔记提到这个人。', 'Delete person profile': '删除人物资料',
  'Delete this meal? This memory will be removed from your archive.': '删除这一餐？这段回忆将从档案中移除。',
  'Delete this meal?': '删除这一餐？', 'This memory will be removed from your archive.': '这段回忆将从档案中移除。',
  '{meal} memory': '{meal}回忆', 'Opening this memory...': '正在打开这段回忆...',
  'This meal could not be found.': '未找到这餐记录。', 'Back to the table': '回到餐桌',
  'Emotion Tag': '心情标签', 'No emotion tag was added.': '还没有添加心情标签。',
  'Memory Note': '回忆笔记', 'This memory was kept without extra words.': '这段回忆没有附加文字。',
  'Delete this memory': '删除这段回忆',
  'Photo permission is needed only if you want to add a profile photo.': '只有添加头像时，才需要照片权限。',
  'A name is enough, but the name is needed.': '只需一个名字，请先填写姓名。',
  'Add someone new': '添加新同伴', 'A seat at the table': '餐桌旁的一个座位',
  'Keep only what you choose to remember. No contacts are read.': '只保留你想记住的，不会读取通讯录。',
  'New person': '新同伴', 'Take photo': '拍照', 'Choose library': '从相册选择', 'Use initials': '使用姓名缩写',
  Name: '姓名', Nickname: '昵称', Relationship: '关系', Note: '笔记', Amy: '小艾',
  'Ames, Mom, Q...': '小艾、妈妈、阿淇...', 'A small note about this person...': '记下关于这个人的小事...', 'Save person': '保存人物',
  'Who shared this meal?': '这顿饭和谁一起吃？', 'Search people at your table': '搜索同桌的人',
  'Who was at the table?': '餐桌旁都有谁？',
  'Add someone you shared this meal with, or keep this meal as a solo memory.': '添加与你一起用餐的人，或留下独自享用的回忆。',
  'Recent people': '最近同桌的人', 'Last shared {date}': '上次同桌 {date}',
  'Frequently added people': '经常同桌的人', 'Add a group photo': '添加合照',
  'Save the meal first, then this photo can be attached to the meal.': '先保存这一餐，再把照片添加进来。',
  'I ate alone': '我独自用餐', 'Add to this meal': '添加到这一餐',
  'Remove from this meal?': '从这一餐移除？',
  'This only removes the person from this meal. Their profile and other shared meals stay.': '只从这一餐移除此人，人物资料和其他同桌记录会保留。',
  'Delete shared photo?': '删除同桌照片？', 'This removes only this shared photograph from the meal.': '只会从这一餐中移除这张同桌照片。',
  Company: '同伴', 'Meal companions, not contacts.': '记下用餐同伴，不读取通讯录。', '+ Add person': '+ 添加同伴',
  'Caption for this shared photo...': '为这张同桌照片写点什么...', 'Save caption': '保存说明',
  'A shared meal photograph': '一张同桌用餐的照片', 'Edit photo': '编辑照片', 'Delete photo': '删除照片',
  'Save the meal first, then add a photograph together.': '先保存这一餐，再添加合照。',
  'Photo permission is needed only if you choose to add a shared photograph.': '只有添加同桌照片时，才需要照片权限。',
  'Choose photo together': '选择同桌照片', 'Take photo together': '拍张同桌照片', 'Add a photo together': '添加一张同桌照片',
  'Caption for this table memory...': '为这段同桌回忆写点什么...', 'Tag people in this photo': '标记照片里的人',
  "Use as this meal's cover photo": '设为这一餐的封面', 'Save photo': '保存照片',
  'Welcome to Mealog': '欢迎来到 Mealog', 'Keep meals as memories.': '让每一餐成为回忆。',
  'A plate, a cup, a note from the room. Mealog keeps ordinary meals with the softness they deserve.': '一只盘子、一只杯子、一段随手记下的话。Mealog 温柔地留住平凡的用餐时光。',
  meal: '用餐', mood: '心情', note: '笔记', 'Photos saved here': '照片留在这里',
  'Pictures stay with the memory.': '让照片陪着回忆留下。',
  'When you add a photo, Mealog keeps its own copy inside the app, so a saved meal does not depend on the original file staying in your library.': '添加照片时，Mealog 会在应用中保留副本。即使相册中的原图不在了，已保存的用餐回忆仍然完整。',
  'photo copy': '照片副本', 'local-first': '本地保存', 'Seats around the table': '餐桌旁的座位',
  'Remember who was there.': '记住当时同桌的人。',
  'A meal can be just yours, shared with someone familiar, or held by a whole table. The chair remembers the company.': '一顿饭可以独自享用，也可以与熟悉的人分享，或热热闹闹坐满一桌。椅子记得那些陪伴。',
  companions: '同伴', 'shared photos': '同桌照片', 'Optional permissions': '可选权限',
  'Choose what Mealog may use.': '由你决定开放哪些权限。',
  'Photos, camera, and location are only requested when you choose them. You can skip now and turn them on later.': '只有你主动选择时，Mealog 才会申请照片、相机和位置权限。可以先跳过，稍后再开启。',
  'Local for now': '目前保存在本地', 'Enter quietly as guest.': '以访客身份入座。',
  'For this product demo, your table starts as a private guest space on this device. Add meals, remember people, save photos, and collect keepsakes.': '在这个产品演示中，你的餐桌是这台设备上的私人访客空间。记录用餐、记住同伴、保存照片，慢慢积攒纪念收藏。',
  'guest mode': '访客模式', 'no account required': '无需账号', Photos: '照片', Camera: '相机', Location: '位置',
  'Choose images for meals and shared table photos.': '为用餐记录和同桌时光选择照片。',
  'Take a meal photo directly when the moment is fresh.': '趁此刻鲜活，直接拍下这一餐。',
  'Optionally remember where a meal happened.': '按需记下用餐地点。',
  'Not asked': '未申请', Limited: '有限访问', Enabled: '已开启', Denied: '未允许', Opening: '打开中',
  'Permission not enabled': '权限未开启', 'Permission unavailable': '暂时无法申请权限',
  'Mealog could not open this permission request right now.': 'Mealog 暂时无法打开此权限请求。',
  'Could not enter Mealog': '暂时无法进入 Mealog', 'Enable {permission} permission': '开启{permission}权限',
  'Skip for now': '暂时跳过', 'Go back to previous onboarding page': '返回上一页引导',
  'Enter Mealog as guest': '以访客身份进入 Mealog', 'Continue from {title}': '从“{title}”继续', 'Enter Mealog': '进入 Mealog',
  'Photo access is used only when you choose a picture for a Mealog memory.': '只有你为 Mealog 回忆选择照片时，才会使用照片权限。',
  'Camera access is used only when you choose to take a picture for Mealog.': '只有你选择为 Mealog 拍照时，才会使用相机权限。',
  'Location is optional and is used only when you choose to remember where a meal happened.': '位置权限是可选的，只有你选择记录用餐地点时才会使用。',
  'Illustrated {month} dining table memory scene': '{month}餐桌回忆插画',
  'Add a meal from the {month} table': '在{month}的餐桌记下一餐',
  'Remember who was around the {month} table': '记下{month}同桌的人',
  'Starter Keepsakes': '初遇收藏', Meals: '用餐', Rhythm: '节奏', Photographs: '照片', Notes: '笔记', Feelings: '心情',
  'Rare Moments': '特别时刻', 'Monthly Keepsakes': '每月收藏', 'Seasonal Keepsakes': '四季收藏',
  'Mealog collection': 'Mealog 收藏', 'Keepsake shelf': '纪念收藏架',
  'A quiet shelf of stamps found through meals, people, notes, photographs, and seasons.': '用餐、同伴、笔记、照片和四季，慢慢化成收藏架上的纪念印章。',
  'Profile and showcase': '个人资料与展示', 'The shelf is waiting for its first small object.': '收藏架在等待第一件小小的纪念。',
  '{count} keepsakes have found their place.': '{count} 件纪念收藏已经安放在这里。',
  '{count} active keepsakes': '{count} 件可收集的纪念', 'View migrated keepsakes': '查看从旧记录中发现的收藏',
  'You found {count} keepsakes from earlier meals.': '从以往的用餐记录中，发现了 {count} 件纪念收藏。',
  'View keepsakes': '查看收藏', 'Newly Found': '新发现', 'Almost There': '即将收集',
  'Nothing close yet.': '暂时还没有即将收集的纪念。',
  'A few more meal memories will bring the nearest keepsakes into view.': '再记下几段用餐回忆，就能看见下一件纪念收藏。',
  'Keepsake Families': '收藏系列', 'Secret Keepsakes': '秘密收藏', 'Secret keepsake': '秘密收藏',
  'A small moment is still waiting.': '一个小小的时刻仍在等待。', 'A small moment\nis still waiting.': '一个小小的时刻\n仍在等待。',
  '???, secret keepsake, A small moment is still waiting.': '未知的秘密收藏，一个小小的时刻仍在等待。',
  NEW: '新', found: '已发现', waiting: '等待中', unlocked: '已收集', secret: '秘密', 'in progress': '收集中',
  '1 left': '还差 1 次', '{count} left': '还差 {count} 次',
  '{title}, {status}, {current} of {total}': '{title}，{status}，进度 {current}/{total}',
  '{title}, {current} of {total}': '{title}，进度 {current}/{total}',
  '{family} · Tier {tier}': '{family} · 第 {tier} 阶', Progress: '进度',
  'This keepsake is resting on your shelf.': '这件纪念已经安放在你的收藏架上。',
  'Found {date}': '发现于 {date}', 'View related record': '查看相关记录',
  'New keepsake found': '发现新纪念', Unlocked: '已收集', 'Place on shelf': '放上收藏架',
  'A major keepsake was found': '发现一件特别的纪念', 'See your journey': '回顾你的旅程',
  'Ready to place on the shelf.': '已经可以放上收藏架。',
  'First Plate': '第一只餐盘', 'The first meal found its place at the table.': '第一餐，在餐桌上找到了自己的位置。',
  'Feeling Candle': '心情烛光', 'A feeling was named and left a little light behind.': '一种心情有了名字，留下一点光。',
  'Pulled Chair': '拉开的椅子', 'A real person profile took a seat at one meal.': '一位记录在册的同伴，在一餐中落座。',
  'Little Photograph': '小小照片', 'A meal became visible enough to keep as an image.': '一顿饭被拍下来，成为可以回看的画面。',
  'Written Corner': '写下的一角', 'A note stayed after the meal was over.': '饭后，一段笔记留了下来。',
  'Small Tablecloth': '小桌布', 'Three meals began to make the table feel lived in.': '三顿饭，让餐桌有了生活的气息。',
  'Set Table': '摆好的餐桌', 'Ten meals now sit together like a small chapter.': '十顿饭聚在一起，像一个小小的篇章。',
  'Well-Loved Table': '珍爱的餐桌', 'Thirty meals have left their gentle marks.': '三十顿饭，留下温柔的痕迹。',
  'Long Table': '长长的餐桌', 'One hundred meals stretch into a long table of days.': '一百顿饭，铺成一张长长的日子餐桌。',
  'Table of Seasons': '四季餐桌', 'Two hundred and fifty meals carry the table through seasons.': '二百五十顿饭，陪餐桌走过四季。',
  'A Life at the Table': '餐桌上的生活', 'Five hundred meals become a living archive.': '五百顿饭，成为鲜活的生活档案。',
  'Three Quiet Days': '三个安静的日子', 'Meals appeared across three different days.': '三个不同的日子，都留下了用餐记录。',
  'Seven Quiet Days': '七个安静的日子', 'A gentle stretch of seven meal days gathered.': '七个有用餐记录的日子，温柔地聚在一起。',
  'A Month Remembered': '记住一个月', 'One month held meals on fifteen different days.': '一个月里，十五个不同的日子留下了用餐记录。',
  'Gentle Rhythm': '温柔的节奏', 'Three months in a row each held at least one meal.': '连续三个月，每月都记下了至少一餐。',
  'Four Seasons': '四季', 'Meals were remembered in spring, summer, autumn, and winter.': '春、夏、秋、冬，都留下了用餐回忆。',
  'Year at the Table': '餐桌上的一年', 'Twelve months in a row each held at least one meal.': '连续十二个月，每月都记下了至少一餐。',
  'Photo Strip': '照片长条', 'Five photographs began a visible thread of meals.': '五张照片，串起看得见的用餐时光。',
  'Table Album': '餐桌相册', 'Fifteen photographs made a small album.': '十五张照片，装成一本小相册。',
  'Memory Box': '回忆盒子', 'Fifty photographs are tucked away for later.': '五十张照片，收好留待以后翻看。',
  'Family Album': '家人相册', 'One hundred photographs became a generous album.': '一百张照片，装成一本厚厚的相册。',
  'Margin Notes': '页边笔记', 'Five meals carried a note in the margin.': '五顿饭，在页边留下笔记。',
  'Table Journal': '餐桌日记', 'Fifteen meal notes now read like a table journal.': '十五段用餐笔记，读来像一本餐桌日记。',
  'Worn Notebook': '翻旧的笔记本', 'Forty meal notes have softened the notebook edges.': '四十段用餐笔记，让本子的边角渐渐柔软。',
  'Book of Meals': '用餐之书', 'One hundred meal notes became a quiet book.': '一百段用餐笔记，汇成一本安静的书。',
  'Mood Vase': '心情花瓶', 'Five meals carried their own emotional weather.': '五顿饭，记录了各自的心情天气。',
  'Full Bouquet': '满满一束花', 'Fifteen feelings gathered like stems in a vase.': '十五种用餐心情，像花枝一样聚在瓶中。',
  'Mood Lantern': '心情灯笼', 'Forty meals were lit by named feelings.': '四十顿饭，被记下的心情照亮。',
  'Emotional Almanac': '心情年鉴', 'One hundred feelings make a small emotional almanac.': '一百次心情记录，汇成一本小小的心情年鉴。',
  'Familiar Seat': '熟悉的座位', 'One person returned to the table three times.': '同一个人，三次回到餐桌旁。',
  'Regular at My Table': '餐桌常客', 'One person shared ten meals with you.': '同一个人，与你一起吃了十顿饭。',
  "Old Friend's Place": '老朋友的位置', 'One person has appeared in twenty-five meal memories.': '同一个人，出现在二十五段用餐回忆里。',
  'Table Company': '同桌陪伴', 'Five shared meals remembered who was there.': '五次同桌用餐，记住了当时的人。',
  'Open Table': '敞开的餐桌', 'Five different people have taken a seat.': '五位不同的人，在餐桌旁落座。',
  'Many Seats': '许多座位', 'Ten different people are part of your table archive.': '十位不同的人，成为餐桌档案的一部分。',
  'Full Table': '坐满一桌', 'Three or more people gathered around one meal.': '一顿饭，三位或更多同伴围坐在一起。',
  'House Full': '满屋相聚', 'Five people shared one generous table.': '五位同伴，共享一桌丰盛。',
  'Shared Photograph': '同桌照片', 'A photograph remembered being together.': '一张照片，记住了相聚。',
  'Photo Together': '一起入镜', 'Five shared photographs now sit near the table.': '五张同桌照片，留在餐桌旁。',
  'Table Reunion': '餐桌重逢', 'A familiar person returned after at least sixty days.': '至少六十天后，熟悉的人再次同桌。',
  'Same Table, New Season': '同桌新季', 'One person shared meals with you in two different seasons.': '同一个人，在两个不同的季节与你同桌。',
  'Midnight Plate': '午夜餐盘', 'A meal was remembered after 11 PM.': '晚上十一点后，记下了一餐。',
  'Sunday Table': '周日餐桌', 'Four different Sundays held a meal memory.': '四个不同的星期日，都留下了用餐回忆。',
  'Breakfast Sun': '早餐晨光', 'Ten breakfasts caught the morning light.': '十顿早餐，接住了清晨的光。',
  'Sweet Corner': '甜蜜角落', 'Ten treats found their small corner.': '十份小食，找到了自己的小小角落。',
  'A Complete Memory': '完整的回忆', 'One meal held feeling, company, photo, and note together.': '一顿饭，同时留下了心情、同伴、照片和笔记。',
  'Dinner by Candlelight': '烛光晚餐', 'A dinner held feeling, company, and photograph.': '一顿晚餐，留下了心情、同伴和照片。',
  'First of the Year': '新年第一餐', 'A year opened with a first meal memory.': '新的一年，从第一段用餐回忆开始。',
  'Last Plate of the Year': '岁末最后一餐', 'The year closed with one last plate.': '最后一只餐盘，为这一年收尾。',
  'Birthday Table': '生日餐桌', 'A celebratory shared meal made a small ceremony.': '一顿欢庆的同桌饭，成为小小的仪式。',
  'Monthly Letter': '每月来信', 'A monthly keepsake placeholder for future rituals.': '为未来的每月仪式预留的纪念收藏。',
  'Seasonal Table Stamp': '四季餐桌印章', 'A seasonal keepsake placeholder for future tables.': '为未来四季餐桌预留的纪念收藏。',
};

function browserLocale(): Locale {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return 'en';
  return /^zh(?:-|$)/i.test(navigator.language ?? navigator.languages?.[0] ?? '') ? 'zh' : 'en';
}

let currentLocale = browserLocale();
let persistence = Promise.resolve();

function localize(locale: Locale, english: string, values?: Interpolation): string {
  const template = locale === 'zh' && Object.prototype.hasOwnProperty.call(zh, english) ? zh[english] : english;
  return template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, doubleKey: string, singleKey: string) => {
    const key = doubleKey ?? singleKey;
    return values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match;
  });
}

/** Translate UI copy only; leave saved names, titles, notes, and captions unchanged. */
export const translate: Translator = (english, values) => localize(currentLocale, english, values);

type I18nContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: Translator };
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(() => currentLocale);
  const selected = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    }
  }, [locale]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LOCALE_KEY).then((saved) => {
      // A choice made while storage loads takes precedence over the old preference.
      if (active && !selected.current && (saved === 'en' || saved === 'zh')) {
        currentLocale = saved;
        updateLocale(saved);
      }
    }).catch(() => { /* The browser/native default still works without storage. */ });
    return () => { active = false; };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (next !== 'en' && next !== 'zh') return;
    selected.current = true;
    currentLocale = next;
    updateLocale(next);
    persistence = persistence.then(() => AsyncStorage.setItem(LOCALE_KEY, next)).catch(() => {});
  }, []);
  const t = useCallback<Translator>((english, values) => localize(locale, english, values), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
