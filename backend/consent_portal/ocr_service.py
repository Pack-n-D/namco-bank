"""
High-Precision OCR & Intelligent Form Extraction Engine for Namco Bank.
Supports Scanned PDFs (OKEN Scanner, CamScanner, Phone Photos, Flatbed Scans) & Images.
"""

import re
import os
import io
import subprocess
import tempfile
import logging
from pathlib import Path
from .branches_data import NAMCO_80_BRANCHES

logger = logging.getLogger(__name__)

TESSERACT_SEARCH_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    r"C:\Users\DELL\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
    r"C:\Tesseract-OCR\tesseract.exe",
]

def find_tesseract():
    for p in TESSERACT_SEARCH_PATHS:
        if os.path.isfile(p):
            return p
    return None


def extract_text_from_pdf_stream(file_bytes):
    """Extract embedded digital text if present."""
    text_content = ""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            t = page.extract_text()
            if t and t.strip():
                text_content += t + "\n"
    except Exception as e:
        logger.warning(f"PDF stream extract: {e}")
    return text_content


def extract_images_from_pdf(file_bytes):
    """Extract all image byte streams from PDF pages."""
    images = []
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            # Method 1: pypdf page.images
            try:
                if hasattr(page, 'images') and page.images:
                    for img in page.images:
                        images.append(img.data)
            except Exception:
                pass

            # Method 2: Inspect raw XObject dictionaries if method 1 returned nothing
            if not images:
                try:
                    if '/Resources' in page and '/XObject' in page['/Resources']:
                        xObject = page['/Resources']['/XObject'].get_object()
                        for obj in xObject:
                            if xObject[obj]['/Subtype'] == '/Image':
                                images.append(xObject[obj].get_data())
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"PDF image extract: {e}")
    return images


def run_ocr_on_image(img_bytes):
    """
    Executes multi-engine OCR on image bytes:
    1. Native Windows Media OCR (100% offline & fast)
    2. Tesseract OCR (if installed)
    """
    raw_lines = []

    # Strategy 1: Native Windows Media.Ocr Engine via win_ocr.ps1
    try:
        ps1_script = Path(__file__).resolve().parent / "win_ocr.ps1"
        if ps1_script.exists():
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_img:
                tmp_img.write(img_bytes)
                tmp_img_path = tmp_img.name

            cmd = [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-File", str(ps1_script),
                "-ImagePath", tmp_img_path
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if proc.stdout and proc.stdout.strip():
                raw_lines.append(proc.stdout.strip())

            try:
                os.remove(tmp_img_path)
            except Exception:
                pass
    except Exception as e:
        logger.info(f"Windows OCR call note: {e}")

    # Strategy 2: Tesseract with Pillow image enhancement (Optional Fallback)
    tesseract_exe = find_tesseract()
    try:
        import importlib
        pil_module = importlib.import_module('PIL.Image')
        pil_enhance = importlib.import_module('PIL.ImageEnhance')
        pytesseract = importlib.import_module('pytesseract')

        Image = getattr(pil_module, 'Image', pil_module)
        ImageEnhance = getattr(pil_enhance, 'ImageEnhance', pil_enhance)

        if tesseract_exe:
            pytesseract.pytesseract.tesseract_cmd = tesseract_exe

        img = Image.open(io.BytesIO(img_bytes))
        gray = img.convert('L')
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.8)

        tess_text = pytesseract.image_to_string(enhanced, config='--oem 3 --psm 6')
        if tess_text and len(tess_text.strip()) > 10:
            raw_lines.append(tess_text)
    except Exception:
        pass

    return "\n".join(raw_lines)


def intelligent_field_extraction(raw_text):
    """
    Parses scanned physical text and extracts customer fields.
    """
    data = {
        "customerName": "",
        "accountNumber": "",
        "customerCif": "",
        "branchName": "CBS Head Office, Nashik",
        "mobileNumber": "",
        "consentChoice": "agree",
        "formDate": "2026-08-31",
        "formPlace": "Nashik",
        "confidence": 0.5,
        "rawTextSample": raw_text[:500] if raw_text else "",
    }

    if not raw_text or not raw_text.strip():
        return data

    text_clean = raw_text.replace('\r', '\n')

    # 1. Mobile Number (10 digits starting with 6,7,8,9)
    # Search for standard e.g. 7262805075
    mob_match = re.search(r'(?:(?:\+91|91|0)?[\s\-]?)?([6-9]\d{9})\b', text_clean)
    if mob_match:
        data["mobileNumber"] = mob_match.group(1)
    else:
        # Check spaced / hyphenated: e.g. 72628 05075, 72628-05075, 7 2 6 2 8 0 5 0 7 5
        spaced_mob = re.search(r'\b([6-9][\d\s\-]{9,20})\b', text_clean)
        if spaced_mob:
            cleaned = re.sub(r'\D', '', spaced_mob.group(1))
            if len(cleaned) == 10 and cleaned.startswith(('6', '7', '8', '9')):
                data["mobileNumber"] = cleaned

    # 2. Account Number
    # Look for account number near Account label or 6-18 digit numbers
    acc_match = re.search(r'(?:Account\s*Number|Acc\s*No|Account\s*No|A/c|Enter\s*bank\s*account\s*number)[\s\:\.\-_]*([0-9\s]{6,20})', text_clean, re.IGNORECASE)
    if acc_match:
        cleaned_acc = re.sub(r'\D', '', acc_match.group(1))
        if 6 <= len(cleaned_acc) <= 18:
            data["accountNumber"] = cleaned_acc
    if not data["accountNumber"]:
        # Look for standalone numbers that aren't the mobile number
        nums = re.findall(r'\b\d{6,16}\b', text_clean)
        for n in nums:
            if n != data.get("mobileNumber"):
                data["accountNumber"] = n
                break

    # 3. Customer ID (CIF)
    cif_match = re.search(r'(?:Customer\s*ID|CIF\s*\(CIF\)|CIF\s*No|CIF)[\s\:\.\-_]*([A-Za-z0-9\s]{1,12})', text_clean, re.IGNORECASE)
    if cif_match:
        cif_val = cif_match.group(1).strip()
        cleaned_cif = re.sub(r'^(CIF|ID|Customer|\:|\-)', '', cif_val, flags=re.IGNORECASE).strip()
        cleaned_cif = re.sub(r'[^A-Za-z0-9]', '', cleaned_cif)
        if cleaned_cif and cleaned_cif != data.get("accountNumber"):
            data["customerCif"] = cleaned_cif

    # 4. Customer Full Name
    # Captures e.g. "Karan Mundade"
    name_match = re.search(r'(?:Name\s*of\s*Customer|Customer\s*Name|Enter\s*full\s*name\s*of\s*account\s*holder)[\s\:\.\-_]*([A-Za-z\s\.\,\'\-]{3,50})', text_clean, re.IGNORECASE)
    if name_match:
        raw_name = name_match.group(1).strip()
        raw_name = re.sub(r'(Enter|Full|Name|Account|Number|CIF|Mobile|Branch|Date|Place).*$', '', raw_name, flags=re.IGNORECASE).strip()
        if len(raw_name) >= 3:
            data["customerName"] = raw_name.title()

    # 5. Branch Name Matching
    for b in NAMCO_80_BRANCHES:
        b_name = b["branch_name"]
        short_kw = b_name.split(',')[0].replace('Branch', '').strip().lower()
        if short_kw in text_clean.lower():
            data["branchName"] = b_name
            break
    if "nashik central" in text_clean.lower() or "central" in text_clean.lower():
        data["branchName"] = "Old City Main Branch, Nashik"

    # 6. Consent Choice
    if re.search(r'do not want|disagree|decline|option\s*b', text_clean, re.IGNORECASE):
        data["consentChoice"] = "disagree"
    else:
        data["consentChoice"] = "agree"

    # 7. Date
    date_match = re.search(r'\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b', text_clean)
    if date_match:
        data["formDate"] = date_match.group(1)

    # Calculate realistic confidence score
    filled = sum(1 for k in ["customerName", "accountNumber", "customerCif", "mobileNumber"] if data[k])
    data["confidence"] = round(min(0.98, max(0.4, filled * 0.25)), 2)

    return data


def process_uploaded_physical_form(file_obj):
    """
    Main entry point for processing physical uploaded forms.
    Extracts text from PDF/Images and returns real extracted fields.
    """
    file_bytes = file_obj.read()
    filename = file_obj.name.lower()
    
    extracted_text = ""

    if filename.endswith('.pdf'):
        # 1. Stream text
        extracted_text = extract_text_from_pdf_stream(file_bytes)

        # 2. Extract and OCR images from scanned PDF pages
        page_images = extract_images_from_pdf(file_bytes)
        for img_bytes in page_images:
            ocr_text = run_ocr_on_image(img_bytes)
            if ocr_text:
                extracted_text += "\n" + ocr_text
    else:
        extracted_text = run_ocr_on_image(file_bytes)

    return intelligent_field_extraction(extracted_text)
