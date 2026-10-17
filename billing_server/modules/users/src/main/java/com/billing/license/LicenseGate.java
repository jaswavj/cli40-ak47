package com.billing.license;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class LicenseGate {

    public static final String EXPIRED_MESSAGE =
            "Your license is over. Contact JasXbill contact no - 8667214152";

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional
    public void assertValid() {
        entityManager.createNativeQuery(
                "UPDATE heading SET `date` = CURDATE() "
                        + "WHERE `date` IS NULL OR CAST(`date` AS CHAR) IN ('', '0000-00-00', '0000-00-00 00:00:00')"
        ).executeUpdate();
        entityManager.flush();

        @SuppressWarnings("unchecked")
        List<Object[]> rows = entityManager.createNativeQuery(
                "SELECT `date`, `active` FROM heading ORDER BY id LIMIT 1"
        ).getResultList();
        if (rows == null || rows.isEmpty()) {
            return;
        }
        Object[] row = rows.get(0);
        LocalDate start = toLocalDate(row[0]);
        if (start == null) {
            start = LocalDate.now();
        }
        int allowedDays = toInt(row.length > 1 ? row[1] : 0);
        long usedDays = ChronoUnit.DAYS.between(start, LocalDate.now());
        if (usedDays >= allowedDays) {
            throw new RuntimeException(EXPIRED_MESSAGE);
        }
    }

    private static LocalDate toLocalDate(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Date sqlDate) {
            return sqlDate.toLocalDate();
        }
        if (raw instanceof LocalDate localDate) {
            return localDate;
        }
        if (raw instanceof java.util.Date utilDate) {
            return new Date(utilDate.getTime()).toLocalDate();
        }
        String value = String.valueOf(raw).trim();
        if (value.isEmpty() || value.startsWith("0000-00-00") || "null".equalsIgnoreCase(value)) {
            return null;
        }
        if (value.length() >= 10) {
            value = value.substring(0, 10);
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private static int toInt(Object raw) {
        if (raw instanceof Number number) {
            return number.intValue();
        }
        if (raw == null) {
            return 0;
        }
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }
}
