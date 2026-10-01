CREATE TABLE gallery_pieces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT,
    medium TEXT,
    exhibition_period TEXT,
    description TEXT NOT NULL,
    filename TEXT NOT NULL
);

INSERT INTO gallery_pieces (filename, title, artist, medium, exhibition_period, description) VALUES 
(
    '1.webp', 
    'Canine Velocity in Flat Color', 
    'Unknown Canine Master', 
    'Flat-Color Acrylic Vector Graphic', 
    'Late Pop-Art / Modern Minimalism', 
    'The artist employs a minimalist, flat-color approach, utilizing bold, simplified geometric shapes. A muted, two-toned background makes the warm, vibrant palette pop, while clean, unshaded vector-like lines deliberately evoke a cheerful, highly modern pop-art aesthetic.'
),
(
    '2.webp', 
    'Midnight Rider', 
    'The Midnight Painter', 
    'Oil on Canvas with Luminescent Underpainting', 
    'Contemporary Surrealism', 
    'Expressive, painterly brushwork defines the composition, set against a remarkably stark, muted beige backdrop. The most striking decision is the incorporation of an ethereal, glowing yellow light source radiating from below, injecting an unexpected, surreal atmosphere.'
),
(
    '3.webp', 
    'Fluid Momentum', 
    'Studio Inksmith', 
    'India Ink on Hot Press Watercolor Paper', 
    'Modern Expressionism', 
    'This piece utilizes a heavy, ink-like silhouette with loose, aggressively distorted lines to visually manifest kinetic energy. The stark, unembellished background purposefully amplifies the high contrast and the sudden, bold splash of warm color below.'
),
(
    '4.webp', 
    'Hovering at Dusk', 
    'Digital Visionary', 
    'Digital Painting and 3D Rendering', 
    'Neo-Futurism', 
    'Executed with smooth, crisp digital rendering, the artwork features a soft, atmospheric color gradient mimicking twilight. Floating elements and glowing, neon turquoise accents are intentionally used to establish a sleek, futuristic, and highly polished aesthetic.'
),
(
    '5.webp', 
    'The Classical Skater', 
    'Master of the Hound', 
    'Oil on Wood Panel', 
    'Faux-Baroque / Neo-Classical', 
    'The composition deliberately mimics Baroque portraiture, employing a rich, earthy palette and dramatic chiaroscuro lighting. Heavy, textured brushstrokes and intentional canvas distressing brilliantly simulate the revered, time-honored techniques of classical oil painting masterpieces.'
),
(
    '6.webp', 
    'Swirling Energy', 
    'The Outsider', 
    'Heavy Impasto Acrylic on Board', 
    'Contemporary Folk Art', 
    'Characterized by a highly textured, expressionistic folk-art style, this piece uses raw, unblended colors and heavy impasto. Rhythmic, swirling concentric patterns are painted directly onto the form, acting as visual metaphors for vibrant, kinetic vitality.'
),
(
    '7.webp', 
    'Hieroglyphic Ride', 
    'Scribe of Anubis', 
    'Pigment on Distressed Papyrus', 
    'Neo-Antiquity', 
    'Embracing a strictly two-dimensional, flat perspective, the composition orientates its subject in rigid profile. The stark silhouette against a distressed, papyrus-like texture cleverly appropriates the symbolic, geometric visual language of ancient Egyptian pictographs and artifacts.'
);