package org.example.citoscan.security;

import lombok.RequiredArgsConstructor;
import org.example.citoscan.model.User;
import org.example.citoscan.repository.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AppUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User u = userRepository.findUserByEmail(email);
        if (u == null) {
            throw new UsernameNotFoundException("User not found");
        }
        return new AppUserDetails(u); // ← usamos nuestra clase personalizada
    }
}
