import { fetchVaultState } from '../../frontend/src/lib/stellar'; // Assume mock integration

export interface AlertRule {
    name: string;
    description: string;
    check: (event: any, state: any) => boolean;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Normalized event shape produced by the ingestion path (eventListener).
 * Amounts are decoded from the vault event schema in the asset's base units
 * (stroops for XLM, 7-decimal units for issued assets) and `address` is the
 * decoded account/contract address from the event topics.
 */
export interface DecodedVaultEvent {
    type: 'deposit' | 'withdraw' | 'auth_failure' | string;
    amount?: bigint;
    address?: string;
    schemaVersion?: number;
    malformed?: boolean;
    raw?: unknown;
}

export const alertRules: AlertRule[] = [
    {
        name: 'TVL_ANOMALY',
        description: 'Sudden drop in TVL detected.',
        check: (event, state) => {
            return event.type === 'withdraw' && event.amount > state.totalAssets * 0.2;
        },
        severity: 'CRITICAL',
    },
    {
        name: 'LARGE_WITHDRAWAL',
        description: 'Large withdrawal detected.',
        check: (event, state) => {
            return event.type === 'withdraw' && event.amount > 100000;
        },
        severity: 'HIGH',
    },
    {
        name: 'AUTH_FAILURE',
        description: 'Authentication failure on vault operations.',
        check: (event, state) => {
            return event.type === 'auth_failure';
        },
        severity: 'MEDIUM',
    },
];

/**
 * Format a decoded base-unit amount for alert copy. Falls back to the raw
 * value when the amount is missing so alerts never invent a placeholder.
 */
function formatAmount(event: DecodedVaultEvent): string {
    if (event.amount === undefined || event.amount === null) {
        return 'unknown amount';
    }
    return event.amount.toString();
}

function formatAddress(event: DecodedVaultEvent): string {
    return event.address ?? 'unknown address';
}

export async function processEventForAlerts(event: DecodedVaultEvent) {
    // Isolate malformed events: surface them as an observable alert instead of
    // letting them crash ingestion or corrupt other alerts.
    if (event.malformed) {
        await triggerAlert(
            {
                name: 'MALFORMED_EVENT',
                description: 'Received an event that could not be decoded against the vault schema.',
                check: () => true,
                severity: 'MEDIUM',
            },
            event,
        );
        return;
    }

    // Mock fetching vault state
    const state = { totalAssets: 1000000 };

    for (const rule of alertRules) {
        if (rule.check(event, state)) {
            await triggerAlert(rule, event);
        }
    }
}

async function triggerAlert(rule: AlertRule, event: DecodedVaultEvent) {
    const detail =
        event.type === 'deposit' || event.type === 'withdraw'
            ? ` amount=${formatAmount(event)} address=${formatAddress(event)}`
            : '';
    console.log(`[ALERT] [${rule.severity}] ${rule.name}: ${rule.description}${detail}`);

    // Mock channel notifications
    await sendEmailAlert(rule, event);
    await sendTelegramAlert(rule, event);
    await sendDiscordAlert(rule, event);

    if (rule.severity === 'CRITICAL') {
        await sendPagerDutyAlert(rule, event);
    }
}

async function sendEmailAlert(rule: AlertRule, event: DecodedVaultEvent) { console.log('Email sent'); }
async function sendTelegramAlert(rule: AlertRule, event: DecodedVaultEvent) { console.log('Telegram message sent'); }
async function sendDiscordAlert(rule: AlertRule, event: DecodedVaultEvent) { console.log('Discord webhook sent'); }
async function sendPagerDutyAlert(rule: AlertRule, event: DecodedVaultEvent) { console.log('PagerDuty incident created'); }
