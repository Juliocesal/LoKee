require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Asegúrate de incluir esta librería

const app = express();
app.use(express.json());
app.use(cors());

// Configuración de Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de JWT
const generarToken = (usuario) => {
    return jwt.sign(
        { id: usuario.id, email: usuario.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
};

// Middleware para autenticación
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido o expirado.' });
        }
        req.user = user; // Adjuntar datos del usuario al objeto request
        next(); // Continuar con el siguiente middleware o controlador
    });
};

// Endpoint protegido
app.put('/api/users/update-role', authenticateToken, async (req, res) => {
    const { role } = req.body;
    const userId = req.user.id;

    try {
        // Actualizar el rol en la tabla `profiles`
        const { error } = await supabase
            .from('profiles')
            .update({ rol: role })
            .eq('id', userId);

        if (error) throw error;

        res.status(200).json({ message: 'Rol actualizado exitosamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el rol.' });
    }
});

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido o expirado.' });
        }
        req.usuario = user; // Adjuntar datos del usuario al objeto request
        next(); // Continuar con el siguiente middleware o controlador
    });
};

// Endpoint de Registro
app.post('/api/registro', async (req, res) => {
    const { nombre_completo, email, contraseña } = req.body;

    try {
        // 1. Verificar si el email ya existe
        const { data: existeUsuario, error: errorExiste } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email);

        if (errorExiste) throw errorExiste;

        if (existeUsuario.length > 0) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }

        // 2. Hashear la contraseña
        const salt = await bcrypt.genSalt(10);
        const contraseñaHash = await bcrypt.hash(contraseña, salt);

        // 3. Insertar nuevo usuario
        const { data: nuevoUsuario, error: errorInsert } = await supabase
            .from('usuarios')
            .insert([{ nombre_completo, email, contraseña_hash: contraseñaHash }])
            .select();

        if (errorInsert) throw errorInsert;

        // 4. Responder con éxito
        res.status(201).json({
            mensaje: 'Registro exitoso',
            usuario: {
                id: nuevoUsuario[0].id,
                email: nuevoUsuario[0].email,
                nombre: nuevoUsuario[0].nombre_completo
            }
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para actualizar el rol del usuario
app.put('/api/users/update-role', authenticateToken, async (req, res) => {
    const { role } = req.body;
    const userId = req.user.id;

    try {
        // Actualizar el rol en la tabla `profiles`
        const { error } = await supabase
            .from('profiles')
            .update({ rol: role })
            .eq('id', userId);

        if (error) throw error;

        res.status(200).json({ message: 'Rol actualizado exitosamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el rol.' });
    }
});

// Endpoint de Login
app.post('/api/login', async (req, res) => {
    const { email, contraseña } = req.body;

    try {
        // 1. Buscar usuario por email
        const { data: usuario, error: errorUsuario } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email);

        if (errorUsuario) throw errorUsuario;

        if (usuario.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // 2. Verificar contraseña
        const contraseñaValida = await bcrypt.compare(
            contraseña,
            usuario[0].contraseña_hash
        );

        if (!contraseñaValida) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // 3. Generar JWT
        const token = generarToken(usuario[0]);

        res.json({
            mensaje: 'Login exitoso',
            token,
            usuario: {
                id: usuario[0].id,
                nombre: usuario[0].nombre_completo,
                email: usuario[0].email,
                verificado: usuario[0].verificado // Devolver el estado
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint de Recuperación de Contraseña
app.post('/api/recuperar-contrasena', async (req, res) => {
    const { email } = req.body;

    try {
        // 1. Verificar si el email existe
        const { data: usuario, error: errorUsuario } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email);

        if (errorUsuario) throw errorUsuario;

        if (usuario.length === 0) {
            return res.status(404).json({ error: 'Email no registrado' });
        }

        // 2. Generar token único con expiración
        const resetToken = crypto.randomBytes(20).toString('hex');
        const resetTokenExpira = new Date(Date.now() + 3600000); // 1 hora

        // 3. Actualizar usuario en la base de datos
        const { error: errorUpdate } = await supabase
            .from('usuarios')
            .update({ reset_token: resetToken, reset_token_expira: resetTokenExpira })
            .eq('id', usuario[0].id);

        if (errorUpdate) throw errorUpdate;

        // 4. Enviar email (simulado para desarrollo)
        console.log(`Enlace de recuperación: http://localhost:5500/reset-password?token=${resetToken}`);

        res.json({ mensaje: 'Se ha enviado un enlace de recuperación a tu email' });

    } catch (error) {
        console.error('Error en recuperación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/complete-profile', verificarToken, async (req, res) => {
    try {
        const userId = req.usuario.id;
        const formData = req.body;

        // Actualizar los datos del usuario en la base de datos
        const { error } = await supabase
            .from('usuarios')
            .update({
                avatar: formData.avatar,
                telefono: formData.phoneNumber,
                documento_identidad: formData.id_document,
                detalles_pago: {
                    cardNumber: formData.cardNumber,
                    expiryDate: formData.expiryDate,
                    cvc: formData.cvc
                },
                direccion_facturacion: {
                    streetAddress: formData.streetAddress,
                    city: formData.city,
                    zipCode: formData.zipCode,
                    country: formData.country
                },
                datos_completados: true
            })
            .eq('id', userId);

        if (error) throw error;

        res.json({ mensaje: 'Perfil completado exitosamente' });
    } catch (error) {
        console.error('Error al completar el perfil:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/skip-datos', verificarToken, async (req, res) => {
    const userId = req.usuario.id;

    try {
        const { error } = await supabase
            .from('usuarios')
            .update({ datos_completados: true })
            .eq('id', userId);

        if (error) throw error;

        res.json({ mensaje: 'Datos omitidos correctamente' });
    } catch (error) {
        console.error('Error al omitir datos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});