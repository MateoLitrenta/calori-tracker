import re
with open('src/components/DailyPanel.tsx', 'r', encoding='utf-8') as f:
    txt = f.read()
new_txt = re.sub(r'<(input|select|textarea)([^>]*)className=\"([^"]*)text-sm([^"]*)\"', r'<\1\2className=\"\3text-base\4\"', txt)
with open('src/components/DailyPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(new_txt)