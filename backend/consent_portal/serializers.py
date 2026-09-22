from rest_framework import serializers
from .models import (
    BankBranch,
    BankOfficer,
    Customer,
    SMSConsent,
    ConsentHistory,
    PhysicalForm,
    AuditLog
)

def mask_account(acc):
    if not acc:
        return ""
    acc_str = str(acc).strip()
    if len(acc_str) <= 4:
        return acc_str
    return "XXXXX" + acc_str[-4:]

def mask_mobile(mob):
    if not mob:
        return ""
    mob_str = str(mob).strip()
    if len(mob_str) <= 4:
        return mob_str
    return mob_str[:2] + "XXXXXX" + mob_str[-2:]

def mask_cif(cif):
    if not cif:
        return ""
    cif_str = str(cif).strip()
    if len(cif_str) <= 4:
        return "CIFXXXX"
    prefix = "CIF" if cif_str.upper().startswith("CIF") else ""
    num_part = cif_str[len(prefix):]
    if len(num_part) <= 3:
        return (prefix or "CIF") + "XXXX" + num_part
    return (prefix or "CIF") + "X" * max(3, len(num_part) - 3) + num_part[-3:]

def mask_reference(ref):
    if not ref:
        return "NAMCO-XXXX"
    ref_str = str(ref).strip()
    parts = ref_str.split('-')
    if len(parts) >= 3:
        return f"{parts[0]}-XXXX-{parts[-1]}"
    return "NAMCO-XXXX" + ref_str[-4:] if len(ref_str) > 4 else "NAMCO-XXXX"


class BankBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankBranch
        fields = '__all__'


class BankOfficerSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = BankOfficer
        fields = [
            'id', 'username', 'full_name', 'employee_id', 'account_number', 'email', 'mobile',
            'branch_name', 'branch_code', 'role', 'is_active', 'failed_login_attempts',
            'locked_until', 'last_login', 'created_at', 'password'
        ]
        read_only_fields = ['id', 'failed_login_attempts', 'locked_until', 'last_login', 'created_at']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({'password': 'Password is required for new officer accounts.'})
        officer = BankOfficer(**validated_data)
        officer.set_password(password)
        officer.save()
        return officer

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class CustomerSerializer(serializers.ModelSerializer):
    masked_account_number = serializers.SerializerMethodField()
    masked_mobile_number = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = '__all__'

    def get_masked_account_number(self, obj):
        return mask_account(obj.account_number)

    def get_masked_mobile_number(self, obj):
        return mask_mobile(obj.mobile_number)


class ConsentHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsentHistory
        fields = '__all__'


class PhysicalFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = PhysicalForm
        fields = '__all__'


class SMSConsentSerializer(serializers.ModelSerializer):
    history = ConsentHistorySerializer(many=True, read_only=True)
    physical_forms = PhysicalFormSerializer(many=True, read_only=True)
    masked_account_number = serializers.SerializerMethodField()
    masked_mobile_number = serializers.SerializerMethodField()

    class Meta:
        model = SMSConsent
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_masked_account_number(self, obj):
        return mask_account(obj.account_number)

    def get_masked_mobile_number(self, obj):
        return mask_mobile(obj.mobile_number)


# Alias for legacy compatibility
SMSConsentRecordSerializer = SMSConsentSerializer


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'
        read_only_fields = ['id', 'timestamp']


# Alias for legacy compatibility
AdminAuditLogSerializer = AuditLogSerializer
