const formatters = {
    currency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount) + 'd';
    },
    date(dateStr) {
        return new Date(dateStr).toLocaleDateString('vi-VN');
    },
    datetime(dateStr) {
        const d = new Date(dateStr);
        return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    }
};

module.exports = formatters;

