package org.example.citoscan;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class CitoScanApplication {
    public static void main(String[] args) {
        SpringApplication.run(CitoScanApplication.class, args);
    }
}
