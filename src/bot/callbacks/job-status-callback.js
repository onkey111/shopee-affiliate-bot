/**
 * Job Status Callback Handler
 *
 * Handles inline keyboard callback for checking job status.
 */

const { Markup } = require('telegraf');
const jobRepo = require('../../db/repositories/job-repository');
const logger = require('../../utils/logger');

/**
 * Format job status message based on status
 * @param {Object} job - Job record from database
 * @returns {string} Formatted status message
 */
function formatStatusMessage(job) {
    const statusEmoji = {
        pending: '⏳',
        processing: '🔄',
        completed: '✅',
        failed: '❌'
    };

    const statusText = {
        pending: 'Dang cho xu ly',
        processing: 'Dang xu ly',
        completed: 'Hoan thanh',
        failed: 'That bai'
    };

    const emoji = statusEmoji[job.status] || '❓';
    const text = statusText[job.status] || 'Khong xac dinh';

    let message = `${emoji} *Trang thai yeu cau #${job.id}*\n\n`;
    message += `📊 Trang thai: ${text}\n`;
    message += `📎 Link goc: ${job.original_url.substring(0, 40)}...\n`;
    message += `🕐 Tao luc: ${new Date(job.created_at).toLocaleString('vi-VN')}\n`;

    if (job.status === 'completed' && job.affiliate_url) {
        // Note: Affiliate URL button is added separately as inline keyboard
        message += `\n🔗 *Link affiliate:* Nhan nut ben duoi de mo`;
    }

    if (job.status === 'failed' && job.error_message) {
        message += `\n⚠️ Loi: ${job.error_message.substring(0, 100)}`;
    }

    if (job.status === 'processing') {
        message += `\n\n_Dang xu ly, vui long doi..._`;
    }

    if (job.attempts > 0) {
        message += `\n\n📈 So lan thu: ${job.attempts}`;
    }

    return message;
}

/**
 * Handle job status callback query
 * @param {Context} ctx - Telegraf context
 */
async function handleJobStatusCallback(ctx) {
    try {
        // Extract job ID from callback data (format: job_status:123)
        const callbackData = ctx.callbackQuery.data;
        const jobId = parseInt(callbackData.split(':')[1]);

        if (isNaN(jobId)) {
            await ctx.answerCbQuery('Ma yeu cau khong hop le!');
            return;
        }

        // Query job from database
        const job = await jobRepo.findById(jobId);

        if (!job) {
            await ctx.answerCbQuery('Khong tim thay yeu cau!');
            return;
        }

        // Format and send status message
        const message = formatStatusMessage(job);

        // Answer callback query first (removes loading state)
        await ctx.answerCbQuery();

        // Build reply options
        const replyOptions = {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        };

        // Add clickable URL button if job is completed with affiliate URL
        if (job.status === 'completed' && job.affiliate_url) {
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.url('🔗 Mo link affiliate', job.affiliate_url)],
                [Markup.button.callback('📦 Gui Order ID', 'submit_order')]
            ]);
            Object.assign(replyOptions, keyboard);
        }

        // Send status as a new message or edit existing
        await ctx.reply(message, replyOptions);

        logger.info('Job status checked', {
            jobId,
            status: job.status,
            userId: ctx.from.id
        });

    } catch (err) {
        logger.error('Error handling job status callback', {
            error: err.message,
            callbackData: ctx.callbackQuery?.data
        });
        await ctx.answerCbQuery('Co loi xay ra. Vui long thu lai!');
    }
}

module.exports = {
    handleJobStatusCallback,
    formatStatusMessage
};

