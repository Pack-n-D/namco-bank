import os
import re

FRONTEND_SRC = r'c:\Users\DELL\Desktop\Namco Bank\frontend\src'

# Regex for emojis
EMOJI_PATTERN = re.compile(
    r'[\U00010000-\U0010ffff]|[\u2600-\u27ff]|[\u2300-\u23ff]|[\u2b50-\u2b55]|[\u203c-\u2049]|[\u25aa-\u25fe]|[\u2190-\u21ff]|[\u2934-\u2935]|[\u3297-\u3299]'
)

def find_emojis():
    for root, dirs, files in os.walk(FRONTEND_SRC):
        for f in files:
            if f.endswith(('.jsx', '.js', '.html', '.css')):
                full_path = os.path.join(root, f)
                with open(full_path, 'r', encoding='utf-8', errors='ignore') as file:
                    lines = file.readlines()
                    for idx, line in enumerate(lines, start=1):
                        emojis = EMOJI_PATTERN.findall(line)
                        if emojis:
                            # Filter out common acceptable symbols like bullets or arrows if needed, but let's see everything
                            print(f"{f}:{idx}: {' '.join(emojis)} --> {line.strip()[:100]}")

if __name__ == '__main__':
    find_emojis()
