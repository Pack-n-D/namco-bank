"""
Namco Bank - On-Premise DLT SMS Gateway Integration Service
===========================================================
Strictly routes 2FA verification codes and customer consent acknowledgments
through Namco Bank's internal datacenter SMS appliance (SMPP / HTTP REST).

Zero external SaaS dependencies (No Twilio, AWS SNS, or public internet required).
Complies with TRAI DLT regulations and RBI Cyber Security Framework.
"""

import os
import logging
import requests
from django.conf import settings

logger = logging.getLogger('namco_bank.sms')

class BankSMSService:
    def __init__(self):
        # Internal Datacenter SMS Gateway Configuration
        self.gateway_url = os.environ.get(
            'BANK_SMS_GATEWAY_URL',
            'http://10.10.5.40:8080/api/v1/sms/send' # Default internal bank appliance IP
        )
        self.api_key = os.environ.get('BANK_SMS_API_KEY', 'NAMCO_INTERNAL_SECURE_TOKEN_2026')
        self.sender_id = os.environ.get('BANK_SMS_SENDER_ID', 'NAMCOB')
        self.dlt_entity_id = os.environ.get('BANK_SMS_DLT_ENTITY_ID', '1401157291823901234')
        self.dlt_template_2fa = os.environ.get('BANK_SMS_DLT_TEMPLATE_2FA', '1407168291029384756')
        self.dlt_template_ack = os.environ.get('BANK_SMS_DLT_TEMPLATE_ACK', '1407168291029384757')
        
        # In development / air-gapped staging where the physical appliance isn't connected:
        self.mock_mode = os.environ.get('BANK_SMS_MOCK_MODE', 'False').lower() in ('true', '1', 'yes')
        self.timeout_seconds = int(os.environ.get('BANK_SMS_TIMEOUT', '4'))

    def send_2fa_otp(self, mobile_number: str, otp_code: str, username: str = "Officer") -> dict:
        """
        Dispatches a high-priority 6-digit administrative 2FA verification code.
        DLT Template: "Your Namco Bank Admin 2FA verification code is {#var#}. Valid for 5 minutes. Do not share. - Namco Bank"
        """
        clean_mobile = str(mobile_number).strip().replace('+91', '').replace('-', '')[-10:]
        message_text = (
            f"Your Namco Bank Admin 2FA verification code is {otp_code}. "
            f"Valid for 5 minutes. Do not share. - Namco Bank"
        )

        payload = {
            "senderId": self.sender_id,
            "entityId": self.dlt_entity_id,
            "templateId": self.dlt_template_2fa,
            "recipient": f"91{clean_mobile}",
            "message": message_text,
            "priority": "HIGH",
            "messageType": "TRANSACTIONAL_OTP"
        }

        if self.mock_mode:
            logger.info(f"[SMS MOCK GATEWAY] 2FA OTP for {username} ({clean_mobile}): {otp_code}")
            return {
                "success": True,
                "mock": True,
                "messageId": f"MOCK-SMS-{otp_code}",
                "recipient": clean_mobile,
                "status": "DELIVERED_MOCK"
            }

        try:
            headers = {
                "Content-Type": "application/json",
                "X-Bank-Auth-Key": self.api_key,
                "User-Agent": "NamcoConsentPortal/3.0"
            }
            response = requests.post(
                self.gateway_url,
                json=payload,
                headers=headers,
                timeout=self.timeout_seconds
            )
            
            if response.status_code in (200, 201):
                resp_json = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                return {
                    "success": True,
                    "mock": False,
                    "messageId": resp_json.get('messageId', 'SENT'),
                    "recipient": clean_mobile,
                    "status": "DISPATCHED_TO_TELCO"
                }
            else:
                logger.error(f"[SMS GATEWAY ERROR] HTTP {response.status_code}: {response.text}")
                return {
                    "success": False,
                    "mock": False,
                    "error": f"Internal SMS Gateway error: HTTP {response.status_code}"
                }
        except Exception as ex:
            logger.error(f"[SMS GATEWAY EXCEPTION] Failed to connect to internal appliance: {str(ex)}")
            return {
                "success": False,
                "mock": False,
                "error": f"Internal SMS Gateway unreachable: {str(ex)}"
            }

    def send_consent_acknowledgment(self, mobile_number: str, customer_name: str, ref_no: str, consent_status: str) -> dict:
        """
        Dispatches SMS confirmation when a customer registers or revokes SMS alert consent.
        """
        clean_mobile = str(mobile_number).strip().replace('+91', '').replace('-', '')[-10:]
        status_text = "ENABLED" if consent_status == "YES" else "DISABLED"
        message_text = (
            f"Namco Bank: Your SMS alert preference has been recorded as {status_text}. "
            f"Reference: {ref_no}. Call 1800-233-6262 for assistance. - Namco Bank"
        )

        payload = {
            "senderId": self.sender_id,
            "entityId": self.dlt_entity_id,
            "templateId": self.dlt_template_ack,
            "recipient": f"91{clean_mobile}",
            "message": message_text,
            "priority": "NORMAL",
            "messageType": "SERVICE_IMPLICIT"
        }

        if self.mock_mode:
            logger.info(f"[SMS MOCK GATEWAY] Consent Ack for {customer_name} ({clean_mobile}): {ref_no} -> {consent_status}")
            return {"success": True, "mock": True, "messageId": f"MOCK-ACK-{ref_no}"}

        try:
            headers = {
                "Content-Type": "application/json",
                "X-Bank-Auth-Key": self.api_key
            }
            response = requests.post(self.gateway_url, json=payload, headers=headers, timeout=self.timeout_seconds)
            return {"success": response.status_code in (200, 201), "mock": False}
        except Exception as ex:
            logger.error(f"[SMS ACK EXCEPTION] {str(ex)}")
            return {"success": False, "mock": False, "error": str(ex)}

# Singleton instance
sms_service = BankSMSService()
