'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  BarChart3, 
  Shield, 
  Clock, 
  CheckCircle,
  ArrowRight,
  Fingerprint,
  TrendingUp,
  School
} from 'lucide-react';

export default function MarketingHomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <MarketingNav />
      <HeroSection />
      <MicroDemoCarousel />
      <ClientLogosSection />
      <InteractiveProductDemo />
      <TestimonialsSection />
      <FinalCTA />
      <MarketingFooter />
    </div>
  );
}

function MarketingNav() {
  return (
    <nav className="fixed top-0 w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg z-50 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <School className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              DRAIS
            </span>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition">Features</a>
            <a href="#clients" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition">Clients</a>
            <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition">Testimonials</a>
            <Link 
              href="/login" 
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition"
            >
              Login
            </Link>
            <Link 
              href="/signup" 
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Book a Demo
            </Link>
          </div>

          <div className="md:hidden">
            <Link 
              href="/login" 
              className="text-blue-600 dark:text-blue-400 font-medium"
            >
              Login
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="pt-32 pb-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Fingerprint className="w-4 h-4 mr-2" />
              Biometric Attendance • Dahua • ZKTeco K40
            </div>

            <h1 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Smart Attendance
              </span>
              <br />
              <span className="text-gray-900 dark:text-white">
                for Modern Schools
              </span>
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
              DRAIS transforms school attendance management with **biometric integration**, 
              real-time analytics, and automated reporting. Trusted by 30+ schools across East Africa.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link 
                href="/signup" 
                className="bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-blue-700 transition shadow-lg hover:shadow-xl flex items-center justify-center group"
              >
                Book a Demo
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              
              <a 
                href="#demo" 
                className="border-2 border-blue-600 text-blue-600 dark:text-blue-400 px-8 py-4 rounded-lg font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition flex items-center justify-center"
              >
                See Attendance Dashboard
              </a>
            </div>

            <div className="mt-12 flex items-center space-x-8 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                30+ Schools
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                Multi-School Support
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                99.9% Uptime
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-8 shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <AttendanceDashboardPreview />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AttendanceDashboardPreview() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Live Attendance</h3>
        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full flex items-center">
          <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span>
          Online
        </span>
      </div>
      
      <div className="space-y-3">
        {[
          { name: 'Ahmad Ibrahim', time: '07:45 AM', method: 'Fingerprint', status: 'present' },
          { name: 'Fatima Hassan', time: '07:52 AM', method: 'Card', status: 'present' },
          { name: 'Omar Juma', time: '08:01 AM', method: 'Fingerprint', status: 'present' }
        ].map((student, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg animate-slide-in" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                {student.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{student.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{student.time} • {student.method}</p>
              </div>
            </div>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 flex justify-between text-xs text-gray-600 dark:text-gray-400">
        <span>Present: 42/45</span>
        <span className="text-green-600 dark:text-green-400 font-semibold">93.3% Attendance</span>
      </div>
    </div>
  );
}

function MicroDemoCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const features = [
    {
      title: 'Biometric Integration',
      description: 'Seamless integration with Dahua and ZKTeco K40 devices for fingerprint and card-based attendance.',
      icon: <Fingerprint className="w-12 h-12 text-blue-600" />,
      stats: { label: 'Device Types', value: '2+' }
    },
    {
      title: 'Real-Time Dashboard',
      description: 'Monitor attendance across all classes and schools in real-time with live updates.',
      icon: <BarChart3 className="w-12 h-12 text-purple-600" />,
      stats: { label: 'Update Speed', value: '<1s' }
    },
    {
      title: 'Automated Reports',
      description: 'Generate comprehensive attendance reports with one click. Export to PDF/Excel.',
      icon: <TrendingUp className="w-12 h-12 text-green-600" />,
      stats: { label: 'Report Types', value: '15+' }
    },
    {
      title: 'Multi-School Management',
      description: 'Manage multiple schools from a single dashboard with complete data isolation.',
      icon: <School className="w-12 h-12 text-orange-600" />,
      stats: { label: 'Schools Supported', value: '∞' }
    },
    {
      title: 'Student Management',
      description: 'Complete learner records, grades, promotions, and parent communication in one place.',
      icon: <Users className="w-12 h-12 text-pink-600" />,
      stats: { label: 'Features', value: '25+' }
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % features.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [features.length]);

  return (
    <section id="features" className="py-20 bg-white dark:bg-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
            Attendance-First Platform
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Built specifically for schools that need reliable, automated attendance tracking with biometric device support.
          </p>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-2xl shadow-2xl">
            <div 
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {features.map((feature, index) => (
                <div key={index} className="min-w-full">
                  <div className="bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-900/20 p-12">
                    <div className="grid md:grid-cols-2 gap-12 items-center">
                      <div>
                        <div className="mb-6">{feature.icon}</div>
                        <h3 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
                          {feature.title}
                        </h3>
                        <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                          {feature.description}
                        </p>
                        <div className="inline-flex items-center bg-white dark:bg-gray-800 px-6 py-3 rounded-lg shadow">
                          <div className="text-center">
                            <div className="text-3xl font-bold text-blue-600">{feature.stats.value}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">{feature.stats.label}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="relative h-80">
                        {index === 0 && <BiometricDeviceIllustration />}
                        {index === 1 && <DashboardIllustration />}
                        {index === 2 && <ReportsIllustration />}
                        {index === 3 && <MultiSchoolIllustration />}
                        {index === 4 && <StudentManagementIllustration />}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation dots */}
          <div className="flex justify-center mt-6 space-x-2">
            {features.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-3 h-3 rounded-full transition-all ${
                  currentSlide === index 
                    ? 'bg-blue-600 w-8' 
                    : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          {/* Navigation arrows */}
          <button
            onClick={() => setCurrentSlide((prev) => (prev - 1 + features.length) % features.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={() => setCurrentSlide((prev) => (prev + 1) % features.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </section>
  );
}

function ClientLogosSection() {
  const clients = [
    { name: 'Northgate Schools', contact: 'Ngobi Peter', location: 'Uganda' },
    { name: 'Albayan Quran Memorization', contact: 'Wagogo Husama', location: 'Tanzania' },
    { name: 'Excel Islamic Nursery & Primary', contact: 'Shk Hassan Mwaita', location: 'Kenya' },
    { name: 'Ibun Baz Girls Secondary', contact: 'Sheik Hassan Mwaita', location: 'Kenya' },
    { name: 'Hillside Academy', contact: 'Admin', location: 'Uganda' },
    { name: 'Bright Future School', contact: 'Director', location: 'Kenya' },
    { name: 'Green Valley International', contact: 'Principal', location: 'Tanzania' },
    { name: 'Al-Noor Islamic School', contact: 'Headmaster', location: 'Kenya' }
  ];

  return (
    <section id="clients" className="py-20 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
            Trusted by 30+ Schools Across East Africa
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            From small Islamic schools to large international academies
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {clients.map((client, index) => (
            <div 
              key={index}
              className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 group"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-bold text-white">
                    {client.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm">{client.name}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">{client.location}</p>
                <div className="mt-2 flex items-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            And many more schools across Uganda, Kenya, and Tanzania
          </p>
          <Link 
            href="/signup" 
            className="inline-flex items-center text-blue-600 dark:text-blue-400 font-semibold hover:underline"
          >
            Join 30+ Schools Using DRAIS
            <ArrowRight className="ml-2 w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function InteractiveProductDemo() {
  const [activeTab, setActiveTab] = useState(0);

  const demos = [
    {
      title: 'Biometric Scan Simulation',
      description: 'Watch how DRAIS processes attendance from Dahua and ZKTeco devices in real-time.',
      component: <BiometricScanDemo />
    },
    {
      title: 'Analytics Dashboard',
      description: 'View attendance trends, late arrivals, and absenteeism patterns across your school.',
      component: <AnalyticsDashboardDemo />
    },
    {
      title: 'Report Generation',
      description: 'Generate comprehensive attendance reports with a single click. Export to PDF or Excel.',
      component: <ReportGenerationDemo />
    }
  ];

  return (
    <section id="demo" className="py-20 bg-white dark:bg-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
            See DRAIS in Action
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Interactive demos showing real attendance workflows
          </p>
        </div>

        <div className="bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-900/20 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            {demos.map((demo, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`flex-1 px-6 py-4 font-semibold transition whitespace-nowrap ${
                  activeTab === index
                    ? 'bg-white dark:bg-gray-800 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-800/50'
                }`}
              >
                {demo.title}
              </button>
            ))}
          </div>

          <div className="p-8 md:p-12">
            <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
              {demos[activeTab].title}
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-8">
              {demos[activeTab].description}
            </p>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              {demos[activeTab].component}
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link 
            href="/signup" 
            className="bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-blue-700 transition shadow-lg inline-flex items-center group"
          >
            Request Full Demo
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  const testimonials = [
    {
      name: 'Ngobi Peter',
      designation: 'Director',
      school: 'Northgate Schools',
      photo: null,
      testimonial: 'DRAIS transformed our attendance management. The biometric integration saved us hours of manual work every day. Highly recommended!',
      rating: 5
    },
    {
      name: 'Wagogo Husama',
      designation: 'Administrator',
      school: 'Albayan Quran Memorization Center',
      photo: null,
      testimonial: 'The reporting features are exceptional. We can now track student attendance patterns and communicate with parents instantly.',
      rating: 5
    },
    {
      name: 'Shk Hassan Mwaita',
      designation: 'Headmaster',
      school: 'Excel Islamic Nursery & Primary School',
      photo: null,
      testimonial: 'Best school management system we\'ve used. The multi-school support allows us to manage all our branches from one dashboard.',
      rating: 5
    },
    {
      name: 'Sheik Hassan Mwaita',
      designation: 'Principal',
      school: 'Ibun Baz Girls Secondary School',
      photo: null,
      testimonial: 'DRAIS is reliable, fast, and easy to use. Our teachers love how simple it is to take attendance and generate reports.',
      rating: 5
    }
  ];

  return (
    <section id="testimonials" className="py-20 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
            What School Leaders Say
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Real feedback from schools using DRAIS daily
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {testimonials.map((testimonial, index) => (
            <div 
              key={index}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all hover:-translate-y-1"
            >
              <div className="flex items-center mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <p className="text-gray-700 dark:text-gray-300 mb-6 italic text-lg leading-relaxed">
                "{testimonial.testimonial}"
              </p>

              <div className="flex items-center">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold mr-4">
                  {testimonial.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">{testimonial.name}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{testimonial.designation}</p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">{testimonial.school}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
          Ready to Transform Your School's Attendance?
        </h2>
        <p className="text-xl text-blue-100 mb-8">
          Join 30+ schools using DRAIS for automated, biometric attendance tracking
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/signup" 
            className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition shadow-lg inline-flex items-center justify-center group"
          >
            Book a Demo
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          
          <a 
            href="mailto:drais@xhenvolt.com" 
            className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition flex items-center justify-center"
          >
            Contact Sales
          </a>
        </div>

        <p className="mt-8 text-blue-100 text-sm">
          💡 No credit card required • Free 30-day trial • Setup in 24 hours
        </p>
      </div>
    </section>
  );
}

function MarketingFooter() {
  return (
    <footer className="bg-gray-900 text-gray-300 py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <School className="w-6 h-6 text-blue-400" />
              <span className="text-xl font-bold text-white">DRAIS</span>
            </div>
            <p className="text-sm text-gray-400">
              Smart school management with biometric attendance for modern Islamic and international schools.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Product</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="hover:text-blue-400 transition">Features</a></li>
              <li><a href="#demo" className="hover:text-blue-400 transition">Demo</a></li>
              <li><Link href="/login" className="hover:text-blue-400 transition">Login</Link></li>
              <li><Link href="/signup" className="hover:text-blue-400 transition">Sign Up</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="#clients" className="hover:text-blue-400 transition">Clients</a></li>
              <li><a href="#testimonials" className="hover:text-blue-400 transition">Testimonials</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Contact</h3>
            <ul className="space-y-2 text-sm">
              <li>Email: drais@xhenvolt.com</li>
              <li>Phone: +256 772 685 323</li>
              <li>Uganda, Kenya, Tanzania</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 text-center text-sm">
          <p>&copy; 2026 DRAIS by Xhenvolt. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

// SVG Illustration Components
function BiometricDeviceIllustration() {
  return (
    <svg viewBox="0 0 400 320" className="w-full h-full">
      {/* Device body */}
      <rect x="100" y="40" width="200" height="280" rx="10" fill="#1f2937" />
      <rect x="110" y="50" width="180" height="200" rx="5" fill="#111827" />
      
      {/* Fingerprint scanner */}
      <circle cx="200" cy="130" r="50" fill="#3b82f6" opacity="0.2" />
      <circle cx="200" cy="130" r="40" fill="#3b82f6" opacity="0.3" />
      <circle cx="200" cy="130" r="30" fill="#3b82f6" opacity="0.4" />
      <circle cx="200" cy="130" r="20" fill="#3b82f6" opacity="0.5" />
      
      {/* Animated pulse */}
      <circle cx="200" cy="130" r="15" fill="#60a5fa" className="animate-pulse" />
      
      {/* Screen */}
      <text x="200" y="190" textAnchor="middle" fill="#10b981" fontSize="14" fontWeight="bold">
        Scan Accepted
      </text>
      <text x="200" y="210" textAnchor="middle" fill="#9ca3af" fontSize="12">
        Ahmad Ibrahim
      </text>
      
      {/* Indicator LEDs */}
      <circle cx="180" cy="280" r="5" fill="#10b981" className="animate-pulse" />
      <circle cx="200" cy="280" r="5" fill="#3b82f6" />
      <circle cx="220" cy="280" r="5" fill="#6366f1" />
    </svg>
  );
}

function DashboardIllustration() {
  return (
    <svg viewBox="0 0 400 320" className="w-full h-full">
      {/* Dashboard container */}
      <rect x="20" y="20" width="360" height="280" rx="8" fill="#1f2937" />
      
      {/* Chart area */}
      <rect x="40" y="40" width="320" height="180" rx="4" fill="#111827" />
      
      {/* Bar chart */}
      {[60, 120, 180, 240, 300].map((x, i) => (
        <rect 
          key={i}
          x={x} 
          y={220 - (i + 1) * 20} 
          width="40" 
          height={(i + 1) * 20} 
          rx="2" 
          fill={`hsl(${210 + i * 20}, 70%, 60%)`}
          className="animate-slide-up"
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
      
      {/* Stats boxes */}
      <rect x="40" y="240" width="100" height="50" rx="4" fill="#10b981" opacity="0.2" />
      <text x="90" y="265" textAnchor="middle" fill="#10b981" fontSize="20" fontWeight="bold">93%</text>
      <text x="90" y="280" textAnchor="middle" fill="#9ca3af" fontSize="10">Present</text>
      
      <rect x="150" y="240" width="100" height="50" rx="4" fill="#f59e0b" opacity="0.2" />
      <text x="200" y="265" textAnchor="middle" fill="#f59e0b" fontSize="20" fontWeight="bold">5%</text>
      <text x="200" y="280" textAnchor="middle" fill="#9ca3af" fontSize="10">Late</text>
      
      <rect x="260" y="240" width="100" height="50" rx="4" fill="#ef4444" opacity="0.2" />
      <text x="310" y="265" textAnchor="middle" fill="#ef4444" fontSize="20" fontWeight="bold">2%</text>
      <text x="310" y="280" textAnchor="middle" fill="#9ca3af" fontSize="10">Absent</text>
    </svg>
  );
}

function ReportsIllustration() {
  return (
    <svg viewBox="0 0 400 320" className="w-full h-full">
      {/* Document */}
      <rect x="80" y="40" width="240" height="260" rx="8" fill="#ffffff" stroke="#e5e7eb" strokeWidth="2" />
      
      {/* Header */}
      <rect x="100" y="60" width="200" height="30" rx="4" fill="#3b82f6" opacity="0.1" />
      <text x="200" y="80" textAnchor="middle" fill="#3b82f6" fontSize="16" fontWeight="bold">Attendance Report</text>
      
      {/* Content lines */}
      {[110, 140, 170, 200, 230, 260].map((y, i) => (
        <g key={i}>
          <rect x="100" y={y} width="120" height="10" rx="2" fill="#e5e7eb" />
          <rect x="230" y={y} width="70" height="10" rx="2" fill={i % 3 === 0 ? '#10b981' : i % 3 === 1 ? '#f59e0b' : '#3b82f6'} opacity="0.3" />
        </g>
      ))}
      
      {/* Download icon */}
      <circle cx="280" cy="270" r="20" fill="#3b82f6" className="animate-pulse" />
      <path d="M270 270 L280 280 L290 270" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <line x1="280" y1="260" x2="280" y2="277" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function MultiSchoolIllustration() {
  return (
    <svg viewBox="0 0 400 320" className="w-full h-full">
      {/* Central hub */}
      <circle cx="200" cy="160" r="40" fill="#3b82f6" opacity="0.2" />
      <circle cx="200" cy="160" r="30" fill="#3b82f6" />
      <text x="200" y="168" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="bold">DRAIS</text>
      
      {/* School nodes */}
      {[
        { x: 100, y: 80, name: 'School A' },
        { x: 300, y: 80, name: 'School B' },
        { x: 100, y: 240, name: 'School C' },
        { x: 300, y: 240, name: 'School D' }
      ].map((school, i) => (
        <g key={i}>
          {/* Connection line */}
          <line 
            x1="200" 
            y1="160" 
            x2={school.x} 
            y2={school.y} 
            stroke="#3b82f6" 
            strokeWidth="2" 
            strokeDasharray="5,5"
            className="animate-pulse"
            style={{ animationDelay: `${i * 200}ms` }}
          />
          
          {/* School circle */}
          <circle cx={school.x} cy={school.y} r="25" fill="#10b981" />
          <text x={school.x} y={school.y + 5} textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">
            {school.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

function StudentManagementIllustration() {
  return (
    <svg viewBox="0 0 400 320" className="w-full h-full">
      {/* Student cards */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${i * 120}, ${i * 40})`}>
          <rect x="40" y="40" width="280" height="80" rx="8" fill="#1f2937" opacity={1 - i * 0.3} />
          {/* Avatar */}
          <circle cx="80" cy="80" r="25" fill={`hsl(${i * 120}, 70%, 60%)`} />
          <text x="80" y="87" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="bold">
            {String.fromCharCode(65 + i)}
          </text>
          {/* Info lines */}
          <rect x="120" y="60" width="180" height="8" rx="4" fill="#4b5563" />
          <rect x="120" y="80" width="140" height="8" rx="4" fill="#4b5563" />
          <rect x="120" y="100" width="100" height="8" rx="4" fill="#10b981" />
        </g>
      ))}
    </svg>
  );
}

function BiometricScanDemo() {
  const [scanning, setScanning] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Device: Dahua Access Control</span>
        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full flex items-center">
          <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span>
          Connected
        </span>
      </div>

      <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-8 text-center">
        <div className="inline-flex items-center justify-center w-32 h-32 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
          <Fingerprint className={`w-16 h-16 text-blue-600 ${scanning ? 'animate-pulse' : ''}`} />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {scanning ? 'Scanning fingerprint...' : 'Waiting for scan'}
        </p>
        <button
          onClick={() => {
            setScanning(true);
            setTimeout(() => setScanning(false), 2000);
          }}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Simulate Scan
        </button>
      </div>

      {scanning && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 animate-slide-in">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
            <div>
              <p className="font-medium text-green-900 dark:text-green-100">Attendance Recorded</p>
              <p className="text-sm text-green-700 dark:text-green-300">Student ID: 12345 • Time: {new Date().toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsDashboardDemo() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { label: 'Present Today', value: '42/45', color: 'green' },
        { label: 'Late Arrivals', value: '3', color: 'yellow' },
        { label: 'Absentees', value: '2', color: 'red' },
        { label: 'Avg. Attendance', value: '93.3%', color: 'blue' }
      ].map((stat, i) => (
        <div 
          key={i}
          className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center hover:scale-105 transition-transform"
        >
          <div className={`text-3xl font-bold mb-1 text-${stat.color}-600`}>
            {stat.value}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportGenerationDemo() {
  const [generating, setGenerating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Report Type</label>
          <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
            <option>Daily Attendance</option>
            <option>Weekly Summary</option>
            <option>Monthly Report</option>
            <option>Student-wise Analysis</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Export Format</label>
          <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
            <option>PDF</option>
            <option>Excel (XLSX)</option>
            <option>CSV</option>
          </select>
        </div>
      </div>

      <button
        onClick={() => {
          setGenerating(true);
          setTimeout(() => setGenerating(false), 2000);
        }}
        disabled={generating}
        className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 flex items-center justify-center"
      >
        {generating ? (
          <>
            <Clock className="w-5 h-5 mr-2 animate-spin" />
            Generating Report...
          </>
        ) : (
          <>
            <BarChart3 className="w-5 h-5 mr-2" />
            Generate Report
          </>
        )}
      </button>

      {generating && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 animate-slide-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Shield className="w-5 h-5 text-blue-600 mr-3" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Report Ready</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">attendance_report_2026_03_10.pdf</p>
              </div>
            </div>
            <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">Download</button>
          </div>
        </div>
      )}
    </div>
  );
}
