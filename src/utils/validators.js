const validators = {
    isShopeeUrl(text) {
        if (!text || typeof text !== 'string') return false;

        // Normalize: trim and handle URL-encoded chars
        const url = text.trim();

        // Patterns for Shopee domains (with or without trailing slash, with query params)
        const patterns = [
            /^https?:\/\/(www\.)?shopee\.vn(\/|$|\?)/i,
            /^https?:\/\/vn\.shp\.ee(\/|$|\?)/i,
            /^https?:\/\/shp\.ee(\/|$|\?)/i,
            /^https?:\/\/s\.shopee\.vn(\/|$|\?)/i
        ];
        return patterns.some(p => p.test(url));
    },
    isOrderId(text) {
        return /^[a-zA-Z0-9]{10,25}$/.test(text.trim());
    },
    extractShopeeUrl(text) {
        if (!text || typeof text !== 'string') return null;

        // Match Shopee URLs including encoded chars and query params
        // Shopee domains: shopee.vn, vn.shp.ee, shp.ee, s.shopee.vn
        const patterns = [
            /https?:\/\/(www\.)?shopee\.vn[^\s]*/i,
            /https?:\/\/vn\.shp\.ee[^\s]*/i,
            /https?:\/\/shp\.ee[^\s]*/i,
            /https?:\/\/s\.shopee\.vn[^\s]*/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[0];
        }

        return null;
    }
};

module.exports = validators;

