#!/usr/bin/env bash
# Creates an Oracle Cloud Always Free VM for the bots, from your Mac, with the OCI CLI.
# Network: VCN, internet gateway, route to the internet, public subnet, security list with only SSH (22) in.
# Safe to run again: existing resources with the same names are reused.
#
# Before the first run:
#   brew install oci-cli
#   oci setup config
#
# Usage:
#   deploy/oracle/create_instance.sh [--compartment OCID] [--ad NAME] [--ssh-key PATH] [--name NAME] [--arm]
# Or the same through env vars: COMPARTMENT_OCID, AVAILABILITY_DOMAIN, SSH_PUBLIC_KEY, INSTANCE_NAME.
#   --compartment  default: the tenancy (root compartment) from ~/.oci/config
#   --ad           default: the first availability domain that offers the shape
#   --ssh-key      default: ~/.ssh/id_ed25519.pub, then ~/.ssh/id_rsa.pub
#   --arm          VM.Standard.A1.Flex (1 OCPU, 6 GB, override with A1_OCPUS / A1_MEMORY_GB) instead of
#                  VM.Standard.E2.1.Micro. More power, but often "Out of host capacity": just retry later.
set -euo pipefail

COMPARTMENT_OCID="${COMPARTMENT_OCID:-}"
AVAILABILITY_DOMAIN="${AVAILABILITY_DOMAIN:-}"
SSH_PUBLIC_KEY="${SSH_PUBLIC_KEY:-}"
INSTANCE_NAME="${INSTANCE_NAME:-telegram-bots}"
SHAPE="VM.Standard.E2.1.Micro"
A1_OCPUS="${A1_OCPUS:-1}"
A1_MEMORY_GB="${A1_MEMORY_GB:-6}"

fail() {
    echo "Error: $*" >&2
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --compartment) COMPARTMENT_OCID="${2:?--compartment needs a value}"; shift 2 ;;
        --ad) AVAILABILITY_DOMAIN="${2:?--ad needs a value}"; shift 2 ;;
        --ssh-key) SSH_PUBLIC_KEY="${2:?--ssh-key needs a value}"; shift 2 ;;
        --name) INSTANCE_NAME="${2:?--name needs a value}"; shift 2 ;;
        --arm) SHAPE="VM.Standard.A1.Flex"; shift ;;
        -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
        *) fail "unknown option '$1' (see --help)" ;;
    esac
done

# --- Checks -----------------------------------------------------------------

command -v oci >/dev/null || fail "OCI CLI not found. Run: brew install oci-cli && oci setup config"
[[ -f "${OCI_CLI_CONFIG_FILE:-$HOME/.oci/config}" ]] || fail "no OCI config. Run: oci setup config"

if [[ -z "$COMPARTMENT_OCID" ]]; then
    COMPARTMENT_OCID="$(awk -F= '/^tenancy *=/ { gsub(/ /, "", $2); print $2; exit }' "${OCI_CLI_CONFIG_FILE:-$HOME/.oci/config}")"
    [[ -n "$COMPARTMENT_OCID" ]] || fail "no tenancy in ~/.oci/config; pass --compartment <OCID>"
fi

if [[ -z "$SSH_PUBLIC_KEY" ]]; then
    for key in "$HOME/.ssh/id_ed25519.pub" "$HOME/.ssh/id_rsa.pub"; do
        if [[ -f "$key" ]]; then SSH_PUBLIC_KEY="$key"; break; fi
    done
fi
[[ -n "$SSH_PUBLIC_KEY" && -f "$SSH_PUBLIC_KEY" ]] \
    || fail "SSH public key not found. Create one (ssh-keygen -t ed25519) or pass --ssh-key <path>.pub"

oci iam compartment get --compartment-id "$COMPARTMENT_OCID" >/dev/null \
    || fail "cannot read compartment $COMPARTMENT_OCID (wrong OCID or OCI CLI not authenticated)"

# --- Helpers ----------------------------------------------------------------

# Prints the OCID of the first resource with this display name in the list output, or nothing.
first_id_named() {
    local name="$1"
    shift
    "$@" --compartment-id "$COMPARTMENT_OCID" --all \
        --query "data[?\"display-name\"=='$name' && \"lifecycle-state\"!='TERMINATED'] | [0].id" \
        --raw-output 2>/dev/null || true
}

is_id() {
    [[ "$1" == ocid1.* ]]
}

# --- Availability domain ----------------------------------------------------

if [[ -z "$AVAILABILITY_DOMAIN" ]]; then
    # The micro shape is offered in only one AD in some regions, so look for it
    for ad in $(oci iam availability-domain list --compartment-id "$COMPARTMENT_OCID" --query 'data[].name' --raw-output | tr -d '[]",'); do
        count="$(oci compute shape list --compartment-id "$COMPARTMENT_OCID" --availability-domain "$ad" --all \
            --query "length(data[?shape=='$SHAPE'])" --raw-output)"
        if [[ "$count" != "0" ]]; then AVAILABILITY_DOMAIN="$ad"; break; fi
    done
    [[ -n "$AVAILABILITY_DOMAIN" ]] || fail "no availability domain offers $SHAPE (free shapes only exist in your home region)"
fi
echo "Shape $SHAPE in $AVAILABILITY_DOMAIN"

# --- Network ----------------------------------------------------------------

VCN_ID="$(first_id_named "$INSTANCE_NAME-vcn" oci network vcn list)"
if ! is_id "$VCN_ID"; then
    echo "Creating VCN..."
    VCN_ID="$(oci network vcn create --compartment-id "$COMPARTMENT_OCID" \
        --display-name "$INSTANCE_NAME-vcn" --cidr-blocks '["10.0.0.0/16"]' --dns-label tgbots \
        --wait-for-state AVAILABLE --query data.id --raw-output)"
fi

IGW_ID="$(first_id_named "$INSTANCE_NAME-igw" oci network internet-gateway list --vcn-id "$VCN_ID")"
if ! is_id "$IGW_ID"; then
    echo "Creating internet gateway..."
    IGW_ID="$(oci network internet-gateway create --compartment-id "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" \
        --display-name "$INSTANCE_NAME-igw" --is-enabled true \
        --wait-for-state AVAILABLE --query data.id --raw-output)"
fi

# All outgoing traffic goes through the internet gateway (the bots poll Telegram)
ROUTE_TABLE_ID="$(oci network vcn get --vcn-id "$VCN_ID" --query 'data."default-route-table-id"' --raw-output)"
echo "Setting the internet route..."
oci network route-table update --rt-id "$ROUTE_TABLE_ID" --force \
    --route-rules "[{\"destination\": \"0.0.0.0/0\", \"destinationType\": \"CIDR_BLOCK\", \"networkEntityId\": \"$IGW_ID\"}]" \
    >/dev/null

SECURITY_LIST_ID="$(first_id_named "$INSTANCE_NAME-ssh-only" oci network security-list list --vcn-id "$VCN_ID")"
if ! is_id "$SECURITY_LIST_ID"; then
    echo "Creating security list (SSH in only)..."
    SECURITY_LIST_ID="$(oci network security-list create --compartment-id "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" \
        --display-name "$INSTANCE_NAME-ssh-only" \
        --egress-security-rules '[{"destination": "0.0.0.0/0", "protocol": "all", "isStateless": false}]' \
        --ingress-security-rules '[{"source": "0.0.0.0/0", "protocol": "6", "isStateless": false,
            "tcpOptions": {"destinationPortRange": {"min": 22, "max": 22}}}]' \
        --wait-for-state AVAILABLE --query data.id --raw-output)"
fi

SUBNET_ID="$(first_id_named "$INSTANCE_NAME-subnet" oci network subnet list --vcn-id "$VCN_ID")"
if ! is_id "$SUBNET_ID"; then
    echo "Creating public subnet..."
    SUBNET_ID="$(oci network subnet create --compartment-id "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" \
        --display-name "$INSTANCE_NAME-subnet" --cidr-block 10.0.0.0/24 --dns-label bots \
        --route-table-id "$ROUTE_TABLE_ID" --security-list-ids "[\"$SECURITY_LIST_ID\"]" \
        --wait-for-state AVAILABLE --query data.id --raw-output)"
fi

# --- Instance ---------------------------------------------------------------

INSTANCE_ID="$(first_id_named "$INSTANCE_NAME" oci compute instance list)"
if ! is_id "$INSTANCE_ID"; then
    # Newest Ubuntu 24.04 image that fits the shape (x86 for micro, aarch64 for A1)
    IMAGE_ID="$(oci compute image list --compartment-id "$COMPARTMENT_OCID" --all \
        --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape "$SHAPE" \
        --sort-by TIMECREATED --sort-order DESC --query 'data[0].id' --raw-output)"
    is_id "$IMAGE_ID" || fail "no Ubuntu 24.04 image found for $SHAPE"

    shape_config=()
    if [[ "$SHAPE" == "VM.Standard.A1.Flex" ]]; then
        shape_config=(--shape-config "{\"ocpus\": $A1_OCPUS, \"memoryInGBs\": $A1_MEMORY_GB}")
    fi

    echo "Launching $INSTANCE_NAME (takes a few minutes)..."
    INSTANCE_ID="$(oci compute instance launch --compartment-id "$COMPARTMENT_OCID" \
        --availability-domain "$AVAILABILITY_DOMAIN" --display-name "$INSTANCE_NAME" \
        --shape "$SHAPE" ${shape_config[@]+"${shape_config[@]}"} --image-id "$IMAGE_ID" \
        --subnet-id "$SUBNET_ID" --assign-public-ip true \
        --ssh-authorized-keys-file "$SSH_PUBLIC_KEY" \
        --wait-for-state RUNNING --query data.id --raw-output)" \
        || fail "launch failed. 'Out of host capacity' means no free VM there right now: retry later or try another --ad"
fi

PUBLIC_IP="$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" --query 'data[0]."public-ip"' --raw-output)"

echo
echo "Done. Public IP: $PUBLIC_IP"
echo "Next: scp deploy/oracle/setup_server.sh ubuntu@$PUBLIC_IP: && ssh ubuntu@$PUBLIC_IP"
