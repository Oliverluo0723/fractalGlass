import { useEffect, useRef } from "react";
import * as T from "three";
import heroImg from "@/assets/images/hero-img.jpg";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uTextureSize;
  uniform vec2 uMouse;
  uniform float uTime;
  uniform float uParallaxStrength;
  uniform float uDistortionMultiplier;
  uniform float uGlassStrength;
  uniform float uStripesFrequency;
  uniform float uGlassSmoothness;
  uniform float uEdgePadding;
  uniform float uFlowSpeed;

  varying vec2 vUv;

  vec2 getCoverUV(vec2 uv, vec2 textureSize) {
    if(textureSize.x < 1.0 || textureSize.y < 1.0) return uv;

    vec2 s = uResolution / textureSize;
    float scale = max(s.x, s.y);
    vec2 scaledSize = textureSize * scale;
    vec2 offset = (uResolution - scaledSize) * 0.5;

    return (uv * uResolution - offset) / scaledSize;
  }

  float displacement(float x, float num_stripes, float strength) {
    float modulus = 1.0 / num_stripes;
    return mod(x, modulus) * strength;
  }

  float fractalGlass(float x, float time) {
    float d = 0.0;
    for (int i = -5; i <= 5; i++) {
      float offset = float(i) * uGlassSmoothness + time * uFlowSpeed;
      d += displacement(x + offset, uStripesFrequency, uGlassStrength);
    }
    d = d / 11.0;
    return x + d;
  }

  float smoothEdge(float x, float padding) {
    float edge = padding;
    if (x < edge) {
      return smoothstep(0.0, edge, x);
    } else if (x > 1.0 - edge) {
      return smoothstep(1.0, 1.0 - edge, x);
    }
    return 1.0;
  }

  void main() {
    vec2 uv = vUv;
    float originalX = uv.x;
    float edgeFactor = smoothEdge(originalX, uEdgePadding);
    
    // 加入時間參數讓玻璃效果流動
    float distorted = fractalGlass(originalX, uTime);
    uv.x = mix(originalX, distorted, edgeFactor);
    
    float distortionFactor = uv.x - originalX;
    
    // 正規化滑鼠座標 (0-1範圍)
    vec2 normalizedMouse = uMouse / uResolution;
    float parallaxDirection = -sign(0.5 - normalizedMouse.x);
    
    vec2 parallaxOffset = vec2(
      parallaxDirection * abs(normalizedMouse.x - 0.5) * uParallaxStrength * 
      (1.0 + abs(distortionFactor) * uDistortionMultiplier),
      0.0
    );
    parallaxOffset *= edgeFactor;
    uv += parallaxOffset;
    
    vec2 coverUV = getCoverUV(uv, uTextureSize);
    coverUV = clamp(coverUV, 0.0, 1.0);
    
    vec4 color = texture2D(uTexture, coverUV);
    gl_FragColor = color;
  }
`;

function FlowingGlassEffect() {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        const renderer = new T.WebGLRenderer({
            antialias: true,
            alpha: true,
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        canvasRef.current = renderer.domElement;

        // 保存 container 引用以供清理使用
        const container = containerRef.current;
        container.appendChild(renderer.domElement);

        const geometry = new T.PlaneGeometry(3, 2);
        const textureLoader = new T.TextureLoader();

        // 使用佔位圖片
        const texture = textureLoader.load(heroImg, (tex) => {
            uniforms.uTextureSize.value.set(tex.image.width, tex.image.height);
        });

        const uniforms = {
            uTexture: { value: texture },
            uResolution: {
                value: new T.Vector2(window.innerWidth, window.innerHeight),
            },
            uTextureSize: {
                value: new T.Vector2(1, 1),
            },
            uMouse: {
                value: new T.Vector2(
                    window.innerWidth / 2,
                    window.innerHeight / 2
                ),
            },
            uTime: { value: 0 },
            uParallaxStrength: { value: 0.1 },
            uDistortionMultiplier: { value: 10 },
            uGlassStrength: { value: 2.0 },
            uStripesFrequency: { value: 35 },
            uGlassSmoothness: { value: 0.00001 },
            uEdgePadding: { value: 0.1 },
            uFlowSpeed: { value: 0.01 }, // 控制流動速度
        };

        const material = new T.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms,
        });

        const plane = new T.Mesh(geometry, material);
        scene.add(plane);
        camera.position.z = 1;

        function onMouseMove(event: MouseEvent) {
            uniforms.uMouse.value.x = event.clientX;
            uniforms.uMouse.value.y = event.clientY;
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            uniforms.uResolution.value.set(
                window.innerWidth,
                window.innerHeight
            );
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("resize", onResize);

        let animationId: number;
        function animate() {
            animationId = requestAnimationFrame(animate);
            uniforms.uTime.value += 0.01;
            renderer.render(scene, camera);
        }
        animate();

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("resize", onResize);
            cancelAnimationFrame(animationId);
            if (canvasRef.current && container) {
                container.removeChild(canvasRef.current);
            }
            geometry.dispose();
            material.dispose();
            texture.dispose();
            renderer.dispose();
        };
    }, []);

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden">
            <div ref={containerRef} className="absolute inset-0" />

            <nav className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center px-12 py-6">
                <div className="text-white text-2xl font-bold">
                    <a
                        href="#"
                        className="hover:text-gray-300 transition-colors"
                    >
                        aioj#JIOC9
                    </a>
                </div>
                <div className="flex gap-8 text-white">
                    <a
                        href="#"
                        className="hover:text-gray-300 transition-colors"
                    >
                        Experiments
                    </a>
                    <a
                        href="#"
                        className="hover:text-gray-300 transition-colors"
                    >
                        Object
                    </a>
                    <a
                        href="#"
                        className="hover:text-gray-300 transition-colors"
                    >
                        Exhibits
                    </a>
                </div>
            </nav>

            <section className="absolute bottom-20 left-0 right-0 z-10 px-12">
                <div className="flex justify-between items-end">
                    <h1 className="text-white text-6xl font-bold max-w-2xl">
                        Designed For the Space
                    </h1>
                    <p className="text-white text-lg max-w-md">
                        體驗流動的玻璃扭曲效果,隨著滑鼠移動產生視差與動態變形
                    </p>
                </div>
            </section>

            <div className="absolute bottom-8 right-12 z-10 text-white text-sm space-y-2">
                <p>移動滑鼠查看視差效果</p>
                <p>自動流動的玻璃扭曲</p>
            </div>
        </div>
    );
}

export default FlowingGlassEffect;
